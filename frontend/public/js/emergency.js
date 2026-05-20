(function () {
  const page = document.getElementById("epage");
  if (!page) return;
  const tagId = page.dataset.tagId;
  const api = page.dataset.api;
  const wa = document.getElementById("wa-btn");
  const bar = document.getElementById("loc-bar");

  function updateWhatsApp(lat, lng) {
    const maps = `https://maps.google.com/?q=${lat},${lng}`;
    const text = `Hello, I found someone with a SafeTag at this location: ${maps}`;
    const base = wa.href.split("?")[0];
    wa.href = `${base}?text=${encodeURIComponent(text)}`;
  }

  function notify(lat, lng) {
    fetch(`${api}/api/location-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId, lat, lng }),
    })
      .then(() => {
        if (bar) bar.classList.remove("hidden");
      })
      .catch(() => {});
  }

  window.addEventListener("load", () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        updateWhatsApp(lat, lng);
        notify(lat, lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
})();
