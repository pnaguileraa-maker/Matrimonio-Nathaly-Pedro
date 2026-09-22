// Fecha del matrimonio: 06-Feb-2027 a las 18:30 hrs
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

// Control de Modal de Regalos
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

// Reproductor de Música de Fondo
let isPlaying = false;
function toggleMusic() {
    const music = document.getElementById('bg-music');
    const icon = document.getElementById('music-icon');

    if (isPlaying) {
        music.pause();
        icon.setAttribute('data-lucide', 'music');
    } else {
        music.play();
        icon.setAttribute('data-lucide', 'pause');
    }
    isPlaying = !isPlaying;
    lucide.createIcons();
}

// Envío del Formulario RSVP (Confirmación de asistencia)
function handleRSVP(event) {
    event.preventDefault();

    const name = document.getElementById('rsvp-name').value;
    const status = document.getElementById('rsvp-status').value;
    const diet = document.getElementById('rsvp-diet').value;
    const message = document.getElementById('rsvp-message').value;
    const feedback = document.getElementById('rsvp-feedback');

    // Mensaje inmediato al usuario
    feedback.classList.remove('hidden');
    feedback.className = "text-xs text-center mt-3 font-semibold text-emerald-700";
    feedback.innerText = `¡Muchas gracias ${name}! Tu respuesta ha sido registrada exitosamente.`;

    // Limpiar formulario
    document.getElementById('rsvp-form').reset();
}