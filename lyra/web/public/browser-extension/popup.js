chrome.storage.session.get("connected").then(({ connected }) => {
  document.body.className = connected ? "on" : "";
  document.getElementById("state").lastChild.textContent = connected ? "Connected to Lyra" : "Not connected";
  document.getElementById("sub").textContent = connected
    ? "Lyra can open and read pages in its own window here. Your own tabs are left alone."
    : "Open Lyra on this computer and turn on Your browser on the Lyra page. This connects by itself.";
});
