chrome.storage.session.get("connected").then(({ connected }) => {
  document.body.className = connected ? "on" : "";
  document.getElementById("state").lastChild.textContent = connected ? "Connected to Cove" : "Not connected";
  document.getElementById("sub").textContent = connected
    ? "Cove can open and read pages in its own window here. Your own tabs are left alone."
    : "Open Cove on this computer and turn on Your browser on the Cove page. This connects by itself.";
});
