// Website Hosted Details - Initialize
let lastData = null;

const $ = id => document.getElementById(id);

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch (e) {
    console.error("getActiveTab error:", e);
    return null;
  }
}

function extractHostname(url) {
  try { return new URL(url).hostname; }
  catch { return null; }
}

function isIpAddress(host) {
  return /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/.test(host) ||
         /^([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4}$/i.test(host);
}

async function resolveDns(host) {
  try {
    // For A and AAAA Records in parallel - Used Google DNS
    const [resA, resAAAA] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${host}&type=1`).then(r => r.json()).catch(() => null),
      fetch(`https://dns.google/resolve?name=${host}&type=28`).then(r => r.json()).catch(() => null),
    ]);

    const ipv4 = resA?.Answer?.find(x => /^\d{1,3}(\.\d{1,3}){3}$/.test(x.data));
    if (ipv4) return { ip: ipv4.data, type: "IPv4" };

    const ipv6 = resAAAA?.Answer?.find(x => x.data?.includes(":"));
    if (ipv6) return { ip: ipv6.data, type: "IPv6" };

    throw new Error("No DNS records found");
  } catch (e) {
    throw new Error("Could not resolve IP for " + host);
  }
}

async function ipInfo(ip) {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
  const data = await res.json();
  if (!data?.success) throw new Error(data.message || "IP lookup failed");
  return data;
}

// DOM helper
function updateEl(id, { text, href, show, hide } = {}) {
  const el = $(id);
  if (!el) return;
  if (text !== undefined) el.textContent = text;
  if (href !== undefined) el.href = href;
  if (show) el.style.display = "block";
  if (hide) el.style.display = "none";
}

function setStatus(text, isError = false) {
  updateEl("status", { text, show: true });
  $("status").style.color = isError ? "#ffffff" : "";
  updateEl("result", { hide: true });
}

// Results
function showResult({ host, ip, type, info }) {
  lastData = { host, ip, type, info };
  const flag = info.flag?.emoji || "";

  updateEl("host", { text: host || "-" });
  updateEl("ip", { text: ip || "-" });
  updateEl("type", { text: type || (ip?.includes(":") ? "IPv6" : "IPv4") });
  updateEl("isp", { text: info.connection?.isp || info.isp || info.org || "-" });
  updateEl("org", { text: info.connection?.org || info.org || "-" });
  updateEl("country", { text: `${flag} ${info.country || "-"}` });
  updateEl("region", { text: info.region || "-" });
  updateEl("city", { text: info.city || "-" });
  updateEl("timezone", { text: info.timezone?.id || info.timezone || "-" });
  // Used google map for coordinates
  const coords = (info.latitude != null && info.longitude != null) 
    ? `${info.latitude}, ${info.longitude}` : "-";
  updateEl("coords", { text: coords });
  if (coords !== "-") updateEl("mapLink", { href: `https://www.google.com/maps/search/?api=1&query=${coords}` });

  updateEl("status", { hide: true });
  updateEl("result", { show: true });
}

async function main(force = false) {
  try {
    if (lastData && !force) return showResult(lastData);

    setStatus("Detecting…");
    const tab = await getActiveTab();
    if (!tab?.url) return setStatus("No active tab URL found", true);

    const host = extractHostname(tab.url);
    if (!host) return setStatus("Invalid page URL", true);

    let ip, type;
    if (isIpAddress(host)) {
      ip = host;
      type = host.includes(":") ? "IPv6" : "IPv4";
    } else {
      try {
        ({ ip, type } = await resolveDns(host));
      } catch {
        // fallback via fetch
        const probe = await fetch(tab.url.startsWith("http") ? tab.url : "https://" + host, { method: "HEAD" });
        const finalHost = extractHostname(probe?.url || tab.url) || host;
        ({ ip, type } = await resolveDns(finalHost));
      }
    }

    const info = await ipInfo(ip);
    showResult({ host, ip, type, info });

  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong", true);
  }
}
// For Refresh and Copy Button
document.addEventListener("DOMContentLoaded", () => {
  $("refresh")?.addEventListener("click", () => main(true));
  $("copy")?.addEventListener("click", async () => {
    const text = `Host: ${$("host")?.textContent}\nIP: ${$("ip")?.textContent}\nISP: ${$("isp")?.textContent}\nOrganization: ${$("org")?.textContent}\nLocation: ${$("city")?.textContent}, ${$("country")?.textContent}\nCoordinates: ${$("coords")?.textContent}`;
    try {
      await navigator.clipboard.writeText(text);
      $("copy").textContent = "Copied!";
      setTimeout(() => $("copy").textContent = "Copy", 1200);
    } catch {
      alert("Copy failed");
    }
  });

  main();
});
