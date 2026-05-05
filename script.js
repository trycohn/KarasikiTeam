// Функция сворачивания отзывов
function toggleReviews() {
    const content = document.getElementById('reviews-content');
    const icon = document.getElementById('reviews-toggle-icon');
    
    if (content.style.display === "none") {
        content.style.display = "block";
        icon.className = "fas fa-chevron-up";
    } else {
        content.style.display = "none";
        icon.className = "fas fa-chevron-down";
    }
}

// Имитация расчета
document.getElementById('calculate-btn').addEventListener('click', () => {
    const origin = document.getElementById('origin').value;
    const dest = document.getElementById('destination').value;
    const priority = document.getElementById('priority').value;

    alert(`Система анализирует варианты для маршрута ${origin} — ${dest} с приоритетом "${priority}"...`);
    
    // В будущем здесь будет fetch запрос к backend
    console.log("Данные отправлены на обработку");
});

// Простая инициализация табов
const tabs = document.querySelectorAll('.tab');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        console.log(`Сортировка по: ${tab.innerText}`);
    });
});