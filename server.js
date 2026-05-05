const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const RUSSIAN_POST_API = 'https://tariff.pochta.ru/v2/calculate/tariff/delivery';
const PECOM_TOWNS_API = 'https://pecom.ru/ru/calc/towns.php';
const PECOM_CALCULATOR_API = 'https://calc.pecom.ru/bitrix/components/pecom/calc/ajax.php';

const cityPostIndexes = {
    'москва': 101000,
    'санкт-петербург': 190000,
    'новосибирск': 630000,
    'екатеринбург': 620000,
    'казань': 420000,
    'нижний новгород': 603000,
    'челябинск': 454000,
    'красноярск': 660000,
    'самара': 443000,
    'уфа': 450000,
    'ростов-на-дону': 344000,
    'омск': 644000,
    'краснодар': 350000,
    'воронеж': 394000,
    'пермь': 614000,
    'волгоград': 400000,
    'саратов': 410000,
    'тюмень': 625000,
    'ижевск': 426000,
    'иркутск': 664000,
    'хабаровск': 680000,
    'ярославль': 150000,
    'владивосток': 690000,
    'томск': 634000,
    'оренбург': 460000,
    'кемерово': 650000,
    'рязань': 390000,
    'астрахань': 414000,
    'пенза': 440000,
    'липецк': 398000,
    'киров': 610000,
    'тула': 300000,
    'калининград': 236000,
    'курск': 305000,
    'сочи': 354000,
    'ставрополь': 355000,
    'тверь': 170000,
    'магнитогорск': 455000,
    'иваново': 153000,
    'брянск': 241000,
    'белгород': 308000,
    'владимир': 600000,
    'архангельск': 163000,
    'чита': 672000,
    'калуга': 248000,
    'смоленск': 214000,
    'курган': 640000,
    'орёл': 302000,
    'вологда': 160000,
    'саранск': 430000,
    'якутск': 677000,
    'мурманск': 183000,
    'тамбов': 392000,
    'петрозаводск': 185000,
    'новороссийск': 353900,
    'йошкар-ола': 424000,
    'кострома': 156000,
    'псков': 180000,
    'южно-сахалинск': 693000,
    'петропавловск-камчатский': 683000,
    'норильск': 663300,
    'уссурийск': 692500
};

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

let pecomTownCache = null;

function normalizeCity(value) {
    return String(value || '').trim().toLowerCase();
}

function parseDimensions(value) {
    const parts = String(value || '')
        .toLowerCase()
        .replace(/[×х*]/g, 'x')
        .split('x')
        .map(part => Number(part.trim()))
        .filter(Boolean);

    if (parts.length !== 3) {
        return null;
    }

    return {
        length: parts[0],
        width: parts[1],
        height: parts[2],
        volume: (parts[0] * parts[1] * parts[2]) / 1000000
    };
}

function validateRequest(data) {
    const dimensions = parseDimensions(data.dimensions);
    const weight = Number(data.weight);

    if (!data.origin || !data.destination) {
        return { error: 'Укажите город отправления и город получения.' };
    }

    if (!weight || weight <= 0) {
        return { error: 'Вес должен быть больше нуля.' };
    }

    if (!dimensions) {
        return { error: 'Размеры нужно указать в формате 30x30x40.' };
    }

    return { dimensions, weight };
}

function getSortScore(priority, offer, cheapestPrice, fastestDays) {
    if (priority === 'price') {
        return cheapestPrice / offer.price;
    }

    if (priority === 'speed') {
        return fastestDays / offer.days;
    }

    return (cheapestPrice / offer.price) * 0.55 + (fastestDays / offer.days) * 0.45;
}

function rankOffers(offers, priority) {
    if (offers.length === 0) {
        return [];
    }

    const cheapestPrice = Math.min(...offers.map(offer => offer.price));
    const fastestDays = Math.min(...offers.map(offer => offer.days));

    return offers
        .map(offer => ({
            ...offer,
            score: getSortScore(priority, offer, cheapestPrice, fastestDays)
        }))
        .sort((a, b) => b.score - a.score);
}

function findRussianPostPrice(postData) {
    const tariffItem = (postData.items || []).find(item => item.tariff);
    const kopecks = Number(
        postData.paynds ||
        postData.pay ||
        postData.paymoneynds ||
        postData.paymoney ||
        tariffItem?.tariff?.valnds ||
        tariffItem?.tariff?.val
    );

    if (!kopecks || !Number.isFinite(kopecks)) {
        return null;
    }

    return Math.round(kopecks / 100);
}

function findRussianPostDays(postData) {
    const deliveryItem = (postData.items || []).find(item => item.delivery);
    const days = Number(
        postData.delivery?.max ||
        postData.delivery?.min ||
        deliveryItem?.delivery?.max ||
        deliveryItem?.delivery?.min
    );

    if (!days || !Number.isFinite(days)) {
        return null;
    }

    return days;
}

async function getRussianPostOffer(data, weight) {
    const fromIndex = cityPostIndexes[normalizeCity(data.origin)];
    const toIndex = cityPostIndexes[normalizeCity(data.destination)];

    if (!fromIndex || !toIndex) {
        return null;
    }

    const url = new URL(RUSSIAN_POST_API);
    url.searchParams.set('json', '');
    url.searchParams.set('object', '4030');
    url.searchParams.set('weight', String(Math.round(weight * 1000)));
    url.searchParams.set('from', String(fromIndex));
    url.searchParams.set('to', String(toIndex));

    try {
        const response = await fetch(url);

        if (!response.ok) {
            return null;
        }

        const postData = await response.json();
        const price = findRussianPostPrice(postData);
        const days = findRussianPostDays(postData);

        if (!price || !days) {
            return null;
        }

        return {
            id: 'russian-post',
            company: 'Почта России',
            price,
            days,
            reason: `Тариф рассчитан через официальный калькулятор Почты России по индексам ${fromIndex} → ${toIndex}.`
        };
    } catch (error) {
        return null;
    }
}

async function loadPecomTowns() {
    if (pecomTownCache) {
        return pecomTownCache;
    }

    const response = await fetch(PECOM_TOWNS_API);

    if (!response.ok) {
        throw new Error('Не удалось получить список городов ПЭК.');
    }

    const regions = await response.json();
    const towns = new Map();

    Object.values(regions).forEach(region => {
        Object.entries(region).forEach(([id, name]) => {
            towns.set(normalizeCity(name), id);
        });
    });

    pecomTownCache = towns;
    return pecomTownCache;
}

function sumPecomServices(pecomData, keys) {
    return keys.reduce((sum, key) => {
        const value = Number(pecomData[key]?.[2]);
        return Number.isFinite(value) ? sum + value : sum;
    }, 0);
}

function parsePecomDays(text) {
    const match = String(text || '').match(/(\d+)\s*-\s*(\d+)/);

    if (match) {
        return Number(match[2]);
    }

    const single = String(text || '').match(/(\d+)/);
    return single ? Number(single[1]) : null;
}

async function getPecomOffers(data, dimensions, weight) {
    try {
        const towns = await loadPecomTowns();
        const fromTown = towns.get(normalizeCity(data.origin));
        const toTown = towns.get(normalizeCity(data.destination));

        if (!fromTown || !toTown) {
            return [];
        }

        const url = new URL(PECOM_CALCULATOR_API);
        const widthMeters = dimensions.width / 100;
        const lengthMeters = dimensions.length / 100;
        const heightMeters = dimensions.height / 100;

        [
            widthMeters,
            lengthMeters,
            heightMeters,
            dimensions.volume,
            weight,
            0,
            0
        ].forEach(value => {
            url.searchParams.append('places[0][]', String(value));
        });

        url.searchParams.set('take[town]', fromTown);
        url.searchParams.set('deliver[town]', toTown);
        url.searchParams.set('strah', '1000');

        const response = await fetch(url);

        if (!response.ok) {
            return [];
        }

        const pecomData = await response.json();

        if (pecomData.error?.length) {
            return [];
        }

        const offers = [];
        const autoPrice = sumPecomServices(pecomData, ['take', 'auto', 'deliver', 'ADD', 'ADD_1', 'ADD_2', 'ADD_3', 'ADD_4']);
        const autoDays = parsePecomDays(pecomData.periods_days || pecomData.periods);

        if (autoPrice > 0 && autoDays) {
            offers.push({
                id: 'pecom-auto',
                company: 'ПЭК Авто',
                price: Math.round(autoPrice),
                days: autoDays,
                reason: `Стоимость рассчитана через публичный калькулятор ПЭК для городов ${data.origin} → ${data.destination}.`
            });
        }

        const aviaPrice = sumPecomServices(pecomData, ['take', 'avia', 'deliver', 'ADD', 'ADD_1', 'ADD_2', 'ADD_3', 'ADD_4']);
        const aviaDays = parsePecomDays(pecomData.aperiods);

        if (aviaPrice > 0 && aviaDays) {
            offers.push({
                id: 'pecom-avia',
                company: 'ПЭК Авиа',
                price: Math.round(aviaPrice),
                days: aviaDays,
                reason: `Авиатариф рассчитан через публичный калькулятор ПЭК для городов ${data.origin} → ${data.destination}.`
            });
        }

        return offers;
    } catch (error) {
        return [];
    }
}

async function calculateOffers(data) {
    const validation = validateRequest(data);

    if (validation.error) {
        return validation;
    }

    const [russianPostOffer, pecomOffers] = await Promise.all([
        getRussianPostOffer(data, validation.weight),
        getPecomOffers(data, validation.dimensions, validation.weight)
    ]);

    const offers = [
        russianPostOffer,
        ...pecomOffers
    ].filter(Boolean);

    return { offers: rankOffers(offers, data.priority) };
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    response.end(JSON.stringify(payload));
}

function handleCalculate(request, response) {
    let body = '';

    request.on('data', chunk => {
        body += chunk;
    });

    request.on('end', async () => {
        try {
            const data = JSON.parse(body || '{}');
            const result = await calculateOffers(data);

            if (result.error) {
                sendJson(response, 400, { error: result.error });
                return;
            }

            sendJson(response, 200, {
                route: {
                    origin: data.origin,
                    destination: data.destination
                },
                offers: result.offers
            });
        } catch (error) {
            sendJson(response, 400, { error: 'Некорректный JSON в запросе.' });
        }
    });
}

function serveStatic(request, response) {
    const requestPath = request.url === '/' ? '/index.html' : request.url;
    const filePath = path.join(__dirname, requestPath);

    if (!filePath.startsWith(__dirname)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            response.writeHead(404);
            response.end('Not found');
            return;
        }

        const extension = path.extname(filePath);
        response.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'text/plain; charset=utf-8' });
        response.end(content);
    });
}

const server = http.createServer((request, response) => {
    if (request.method === 'OPTIONS') {
        response.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        });
        response.end();
        return;
    }

    if (request.method === 'POST' && request.url === '/api/calculate') {
        handleCalculate(request, response);
        return;
    }

    if (request.method === 'GET') {
        serveStatic(request, response);
        return;
    }

    sendJson(response, 405, { error: 'Метод не поддерживается.' });
});

server.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});
