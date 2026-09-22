// Fecha del matrimonio: 06 de Febrero de 2027 a las 18:30 hrs
const eventDate = new Date("2027-02-06T18:30:00").getTime();

function updateCountdown() {
    const now = new Date().getTime();
    const distance = eventDate - now;

    if (distance < 0) {
        document.getElementById("countdown").innerHTML = "<p class='col-span-4 text-center font-bold text-stone-700'>¡Hoy es nuestro gran día!</p>";
        return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    document.getElementById("days").innerText = days < 10 ? '0' + days : days;
    document.getElementById("hours").innerText = hours < 10 ? '0' + hours : hours;
    document.getElementById("minutes").innerText = minutes < 10 ? '0' + minutes : minutes;
    document.getElementById("seconds").innerText = seconds < 10 ? '0' + seconds : seconds;
}

setInterval(updateCountdown, 1000);
updateCountdown();

// Abrir / Cerrar Modal de Regalos
function toggleModal(show) {
    const modal = document.getElementById('gift-modal');
    if (show) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}
// Generar evento en Google Calendar sin errores de zona horaria
function addToCalendar() {
    const title = encodeURIComponent("Matrimonio Nathaly y Pedro");
    const details = encodeURIComponent("¡Acompáñanos a celebrar nuestro matrimonio!");
    const location = encodeURIComponent("Chillán, Chile");

    // Inicio: 06/Feb/2027 a las 18:30 Chile (21:30 UTC)
    // Fin:    07/Feb/2027 a las 03:30 Chile (06:30 UTC del día siguiente)
    const startDate = "20270206T213000Z";
    const endDate = "20270207T063000Z";

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${details}&location=${location}`;

    window.open(googleUrl, '_blank');
}