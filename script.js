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
// Generar evento de calendario compatible 100% con celulares y escritorio
function addToCalendar() {
    const title = "Matrimonio Nathaly y Pedro";
    const details = "¡Acompáñanos a celebrar nuestro matrimonio!";
    const location = "Chillán, Chile";

    // Fechas en formato UTC (06/Feb/2027 18:30 Chile = 21:30 UTC)
    const startDate = "20270206T213000Z";
    const endDate = "20270207T063000Z";

    // Si es un dispositivo móvil, generamos y descargamos un archivo .ics (iCalendar)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
        const icsData = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Invitacion Matrimonio//ES",
            "BEGIN:VEVENT",
            `SUMMARY:${title}`,
            `DESCRIPTION:${details}`,
            `LOCATION:${location}`,
            `DTSTART:${startDate}`,
            `DTEND:${endDate}`,
            "END:VEVENT",
            "END:VCALENDAR"
        ].join("\n");

        const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute("download", "Matrimonio_Nathaly_y_Pedro.ics");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        // En computadoras de escritorio se abre la web de Google Calendar
        const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
        window.open(googleUrl, '_blank');
    }
}