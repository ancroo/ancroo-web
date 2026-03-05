// Microphone permission must be requested directly inside a user gesture (click).
// No async message hops, no page-load auto-call — Chrome requires a real click.
document.getElementById("btn").addEventListener("click", function () {
  var status = document.getElementById("status");
  var btn = document.getElementById("btn");
  btn.disabled = true;
  status.textContent = "Requesting access...";
  status.className = "";

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(function (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      return navigator.mediaDevices.enumerateDevices();
    })
    .then(function (devices) {
      var mics = devices
        .filter(function (d) { return d.kind === "audioinput"; })
        .map(function (d) { return { deviceId: d.deviceId, label: d.label }; });
      status.textContent = "Permission granted! This tab will close automatically.";
      status.className = "success";
      chrome.runtime.sendMessage({ type: "MIC_PERMISSION_RESULT", ok: true, devices: mics });
    })
    .catch(function (err) {
      status.textContent = "Denied: " + (err.message || err) + ". Try again or check chrome://settings/content/microphone";
      status.className = "error";
      btn.disabled = false;
      chrome.runtime.sendMessage({ type: "MIC_PERMISSION_RESULT", ok: false, error: err.message || String(err) });
    });
});
