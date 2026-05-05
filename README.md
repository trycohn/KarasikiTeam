# KarasikiTeam

Учебный проект "Логистик-Навигатор": пользователь вводит маршрут, вес и размеры посылки, а backend возвращает подходящие компании доставки.

## Как запустить

```bash
npm start
```

После запуска сайт будет доступен по адресу:

```text
http://localhost:3000
```



## Что делает backend

Backend находится в `server.js`.

Основной endpoint:

```http
POST /api/calculate
```

Пример тела запроса:

```json
{
  "origin": "Москва",
  "destination": "Владивосток",
  "weight": 5,
  "dimensions": "30x30x40",
  "priority": "price"
}
```

Backend обращается только к реальным открытым калькуляторам:

- Почта России: `https://tariff.pochta.ru/v2/calculate/tariff/delivery`
- ПЭК: `https://pecom.ru/ru/calc/towns.php` и `https://calc.pecom.ru/bitrix/components/pecom/calc/ajax.php`

Если конкретный сервис не вернул тариф для маршрута, он просто не попадает в выдачу.
