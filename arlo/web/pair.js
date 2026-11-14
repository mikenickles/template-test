// Pairing page: exchanges the one-time code for this device's own key.
const code = document.getElementById('code');
const message = document.getElementById('message');

async function pair(value) {
  message.textContent = 'Pairing…';
  const name = /Android/.test(navigator.userAgent) ? 'Android phone' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'Browser';
  const res = await fetch('/api/pair/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: value, name }),
  });
  if (res.ok) {
    location.replace('/');
    return;
  }
  const data = await res.json().catch(() => ({}));
  message.textContent = data.error || 'That didn\'t work. Try a fresh code.';
}

document.getElementById('pair').addEventListener('submit', (e) => {
  e.preventDefault();
  if (code.value.trim()) pair(code.value.trim());
});

// A scanned QR code carries the code after the # so it never reaches a server log.
const fromLink = location.hash.slice(1);
if (fromLink) {
  history.replaceState(null, '', '/pair');
  code.value = fromLink;
  pair(fromLink);
} else code.focus();
