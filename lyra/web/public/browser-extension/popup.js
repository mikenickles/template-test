chrome.storage.session.get("connected").then(({ connected }) => {
  document.body.className = connected ? "on" : "";
  document.getElementById("state").lastChild.textContent = connected ? "Connected to Tomo" : "Not connected";
  document.getElementById("sub").textContent = connected
    ? "Tomo can open and read pages in its own window here. Your own tabs are left alone."
    : "Open Tomo on this computer and turn on Your browser on the Tomo page. This connects by itself.";
});
