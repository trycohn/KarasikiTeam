let lastOffers = [];
let activeSort = 'recommendation';

function toggleReviews() {
    const content = document.getElementById('reviews-content');
    const icon = document.getElementById('reviews-toggle-icon');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.className = 'fas fa-chevron-up';
    } else {
        content.style.display = 'none';
        icon.className = 'fas fa-chevron-down';
    }
}

function getFormData() {
    return {
        origin: document.getElementById('origin').value.trim(),
        destination: document.getElementById('destination').value.trim(),
        weight: Number(document.getElementById('weight').value),
        dimensions: document.getElementById('dimensions').value.trim(),
        priority: document.getElementById('priority').value
    };
}

function setMessage(text, isError = false) {
    const message = document.getElementById('form-message');
    message.textContent = text;
    message.classList.toggle('error', isError);
}

function sortOffers(offers, sortBy) {
    const sorted = [...offers];

    if (sortBy === 'price') {
        return sorted.sort((a, b) => a.price - b.price);
    }

    if (sortBy === 'speed') {
        return sorted.sort((a, b) => a.days - b.days);
    }

    return sorted.sort((a, b) => b.score - a.score);
}

function getLogoClass(index) {
    if (index === 0) return 'gold';
    if (index === 1) return 'blue';
    return 'grey';
}

function renderOffers(offers) {
    const list = document.getElementById('results-list');
    const count = document.getElementById('results-count');
    const sorted = sortOffers(offers, activeSort);

    count.textContent = sorted.length;

    if (sorted.length === 0) {
        list.innerHTML = `
            <div class="card empty-state">
                <h3>Подходящих тарифов не найдено</h3>
                <p>Почта России и ПЭК не вернули расчет для этих городов, веса или размеров.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = sorted.map((offer, index) => {
        const isFeatured = index === 0;
        const logoClass = getLogoClass(index);
        const icon = isFeatured ? 'fa-shield-alt' : 'fa-truck';

        if (isFeatured) {
            return `
                <div class="recommendation-badge">НАШ ВЫБОР</div>
                <div class="card featured-card">
                    <div class="card-main-info">
                        <div class="company-info">
                            <div class="company-logo ${logoClass}"><i class="fas ${icon}"></i></div>
                            <div class="company-name">${offer.company}</div>
                        </div>
                        <div class="metrics">
                            <div class="metric">
                                <span class="label">Цена</span>
                                <span class="value">${offer.price.toLocaleString('ru-RU')} руб.</span>
                            </div>
                            <div class="metric">
                                <span class="label">Срок</span>
                                <span class="value">${offer.days} дн.</span>
                            </div>
                        </div>
                    </div>
                    <div class="card-explanation">
                        <h4>Почему эта компания выше остальных?</h4>
                        <p>${offer.reason}</p>
                        <button class="order-btn" type="button">Оформить заказ</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="card simple-card">
                <div class="company-info">
                    <div class="company-logo ${logoClass}"><i class="fas ${icon}"></i></div>
                    <div>
                        <div class="company-name">${offer.company}</div>
                        <div class="metrics-row">
                            <span>${offer.price.toLocaleString('ru-RU')} руб.</span>
                            <span>•</span>
                            <span>${offer.days} дн.</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function calculateDelivery() {
    const button = document.getElementById('calculate-btn');
    const payload = getFormData();
    const apiUrl = window.location.protocol === 'file:'
        ? 'http://localhost:3000/api/calculate'
        : '/api/calculate';

    button.disabled = true;
    button.textContent = 'Считаем...';
    setMessage('Запрашиваем тарифы у Почты России и ПЭК...');

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Не удалось рассчитать доставку');
        }

        lastOffers = data.offers;
        activeSort = 'recommendation';
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.sort === activeSort);
        });

        renderOffers(lastOffers);
        setMessage(`Маршрут: ${data.route.origin} → ${data.route.destination}. Расчет готов.`);
    } catch (error) {
        const message = window.location.protocol === 'file:'
            ? 'Для реальных расчетов нужно запустить backend через npm start и открыть http://localhost:3000.'
            : error.message;

        setMessage(message, true);
    } finally {
        button.disabled = false;
        button.textContent = 'Рассчитать стоимость';
    }
}

document.getElementById('calculate-btn').addEventListener('click', calculateDelivery);

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        activeSort = tab.dataset.sort;
        document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
        tab.classList.add('active');
        renderOffers(lastOffers);
    });
});
