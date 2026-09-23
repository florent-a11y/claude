// Field mapping: logical key → list of candidate selectors on the official form.
// The official form's markup is not published; fill in / adjust selectors after inspecting the live page.
// Keys map to the order JSON produced by the ops console.
const MAPPING = {
  familyName: ['input[name*="family" i]', 'input[name*="surname" i]', 'input[id*="lastName" i]'],
  givenNames: ['input[name*="given" i]', 'input[name*="first" i]', 'input[id*="firstName" i]'],
  dateOfBirth: ['input[name*="birth" i]', 'input[id*="dob" i]'],
  passportNumber: ['input[name*="passport" i]', 'input[id*="passportNumber" i]'],
  passportExpiry: ['input[name*="expir" i]'],
  passportIssued: ['input[name*="issue" i]'],
  nationality: ['select[name*="national" i]', 'input[name*="national" i]'],
  gender: ['select[name*="gender" i]', 'select[name*="sex" i]'],
  email: ['input[type="email"]', 'input[name*="email" i]'],
  phone: ['input[type="tel"]', 'input[name*="phone" i]'],
  arrivalDate: ['input[name*="arrival" i]'],
  flightNumber: ['input[name*="flight" i]', 'input[name*="vessel" i]'],
  accommodationName: ['input[name*="hotel" i]', 'input[name*="accommodation" i]'],
  accommodationAddress: ['input[name*="address" i]', 'textarea[name*="address" i]'],
  accommodationCity: ['input[name*="city" i]'],
};

function setValue(el, value) {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (el.tagName === "SELECT") {
    const opt = [...el.options].find((o) => o.value === value || o.text.toLowerCase().includes(String(value).toLowerCase()));
    if (!opt) return false;
    value = opt.value;
  }
  setter ? setter.call(el, value) : (el.value = value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req.type !== "FILL") return;
  const t = req.order.travelers?.[req.idx] ?? {};
  const values = { ...t, ...req.order.travel, ...req.order.contact };
  let filled = 0; const missed = [];
  for (const [key, selectors] of Object.entries(MAPPING)) {
    const value = values[key];
    if (value === undefined || value === "") continue;
    const el = selectors.map((s) => document.querySelector(s)).find(Boolean);
    if (el && setValue(el, value)) { filled++; el.style.outline = "2px solid #0f7a5f"; } else missed.push(key);
  }
  sendResponse({ filled, missed });
});
