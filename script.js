/* TripMate — local-first trip planner.
   For secure cross-device sharing, connect Firebase Authentication + Firestore
   and move trip/expense writes to authenticated database transactions. */
const STORAGE_KEY = "tripmate.trips.v1";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
let trips = loadTrips();
let activeTripId = trips.find(t => t.status === "active")?.id || trips[0]?.id || null;
let toastTimer;

function loadTrips() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeTrip) : [];
  } catch (error) {
    console.error("Could not read saved trips", error);
    return [];
  }
}
function normalizeTrip(t) {
  return {
    id: t.id || uid(), name: t.name || "Untitled trip", startDate: t.startDate || todayISO(),
    endDate: t.endDate || t.startDate || todayISO(), members: Array.isArray(t.members) ? t.members : [],
    travelMode: t.travelMode || "Other", budget: Math.max(0, Number(t.budget) || 0),
    places: Array.isArray(t.places) ? t.places : [], expenses: Array.isArray(t.expenses) ? t.expenses : [],
    status: t.status || "planned", createdAt: t.createdAt || new Date().toISOString()
  };
}
function saveTrips() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); }
  catch (error) { showToast("Could not save data. Check browser storage."); console.error(error); }
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
function getTrip(id = activeTripId) { return trips.find(t => t.id === id) || null; }
function spentTotal(trip) { return trip.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0); }
function balance(trip) { return Number(trip.budget) - spentTotal(trip); }
function daysBetween(start, end) {
  const a = new Date(`${start}T12:00:00`), b = new Date(`${end}T12:00:00`);
  return Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? 1 : Math.max(1, Math.round((b - a) / 86400000) + 1);
}
function tripStatus(trip) {
  if (trip.status === "completed") return "completed";
  const today = todayISO();
  if (trip.startDate <= today && trip.endDate >= today) return "active";
  if (trip.endDate < today) return "completed";
  return "planned";
}
function updateStatuses() {
  trips.forEach(trip => { if (trip.status !== "completed") trip.status = tripStatus(trip); });
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function dateLabel(iso, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!iso) return "Date not set";
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-IN", options);
}
function modeIcon(mode) {
  return ({ Car:"car-front", Bike:"bike", Bus:"bus", Train:"train-front", Flight:"plane", Other:"navigation" })[mode] || "navigation";
}
function expenseIcon(category) {
  return ({ Food:"utensils", Fuel:"fuel", Stay:"bed-double", Transport:"car-front", Tickets:"ticket", Shopping:"shopping-bag", Other:"receipt" })[category] || "receipt";
}
function renderTripCard(trip, index = 0) {
  const spent = spentTotal(trip), remaining = balance(trip);
  const percent = trip.budget > 0 ? Math.min(100, Math.max(0, spent / trip.budget * 100)) : 0;
  const destination = trip.places.map(p => typeof p === "string" ? p : p.name).filter(Boolean).slice(0, 3).join(" · ") || "Destination not added";
  return `<article class="trip-card">
    <div class="trip-cover theme-${index % 4}"><div class="cover-orb"></div><span class="trip-mode"><i data-lucide="${modeIcon(trip.travelMode)}"></i>${escapeHTML(trip.travelMode)} TRIP</span><span class="trip-status">${escapeHTML(tripStatus(trip))}</span><h3>${escapeHTML(trip.name)}</h3></div>
    <div class="trip-card-body"><div class="trip-destination"><i data-lucide="map-pin"></i><span>${escapeHTML(destination)}</span></div>
      <div class="trip-meta"><span><i data-lucide="calendar-days"></i>${dateLabel(trip.startDate,{month:"short",day:"numeric"})} – ${dateLabel(trip.endDate,{month:"short",day:"numeric"})}</span><span><i data-lucide="users"></i>${trip.members.length} travellers</span><span><i data-lucide="clock-3"></i>${daysBetween(trip.startDate,trip.endDate)} days</span></div>
      <div class="trip-budget"><div><small>Remaining budget</small><strong>${money(remaining)}</strong></div><div class="spent-mini"><small>Spent / Budget</small><strong>${money(spent)} / ${money(trip.budget)}</strong></div></div>
      <div class="mini-track"><span style="width:${percent}%"></span></div>
      <div class="card-actions"><button class="btn btn-secondary" data-open-vault="${trip.id}"><i data-lucide="wallet"></i> Open vault</button><button class="btn btn-secondary" data-open-plan="${trip.id}"><i data-lucide="route"></i> Itinerary</button></div>
    </div></article>`;
}
function renderHome() {
  updateStatuses();
  $("#statTrips").textContent = trips.length;
  const active = trips.find(t => tripStatus(t) === "active") || trips[0];
  $("#statBalance").textContent = active ? money(balance(active)) : money(0);
  $("#statSpent").textContent = money(trips.reduce((sum,t) => sum + spentTotal(t),0));
  $("#recentCount").textContent = `${Math.min(trips.length,4)} trip${Math.min(trips.length,4) === 1 ? "" : "s"}`;
  $("#recentTrips").innerHTML = trips.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,4).map((t,i) => renderTripCard(t,i)).join("");
  $("#homeEmpty").hidden = trips.length > 0;
  $("#recentTrips").hidden = trips.length === 0;
}
function renderTrips() {
  updateStatuses();
  const query = ($("#tripSearch").value || "").trim().toLowerCase();
  const filter = $("#tripFilter").value;
  const filtered = trips.filter(t => {
    const matchQuery = `${t.name} ${t.places.map(p => typeof p === "string" ? p : p.name).join(" ")}`.toLowerCase().includes(query);
    const matchStatus = filter === "all" || tripStatus(t) === filter;
    return matchQuery && matchStatus;
  }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  $("#allTrips").innerHTML = filtered.map((t,i) => renderTripCard(t,i)).join("");
  $("#tripsEmpty").hidden = filtered.length > 0;
  $("#allTrips").hidden = filtered.length === 0;
}
function fillTripSelect(select, selectedId) {
  select.innerHTML = trips.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("");
  if (selectedId && trips.some(t => t.id === selectedId)) select.value = selectedId;
}
function renderVault() {
  const hasTrips = trips.length > 0;
  $("#vaultNoTrip").hidden = hasTrips;
  $("#vaultContent").hidden = !hasTrips;
  if (!hasTrips) return;
  if (!getTrip(activeTripId)) activeTripId = trips[0].id;
  fillTripSelect($("#vaultTripSelect"), activeTripId);
  const trip = getTrip(activeTripId), spent = spentTotal(trip), remaining = balance(trip);
  const percent = trip.budget > 0 ? Math.min(100, Math.max(0, spent / trip.budget * 100)) : (spent > 0 ? 100 : 0);
  $("#vaultBalance").textContent = money(remaining);
  $("#vaultTripName").textContent = `${trip.name} · ${dateLabel(trip.startDate,{month:"short",day:"numeric"})} – ${dateLabel(trip.endDate,{month:"short",day:"numeric"})}`;
  $("#budgetProgress").style.width = `${percent}%`;
  $("#budgetSpentLabel").textContent = `${money(spent)} spent`;
  $("#budgetPercent").textContent = `${Math.round(percent)}% used`;
  $("#budgetTotalLabel").textContent = `of ${money(trip.budget)}`;
  $("#vaultOriginal").textContent = money(trip.budget);
  $("#vaultSpent").textContent = money(spent);
  $("#vaultMembers").textContent = trip.members.length;
  const category = $("#expenseCategoryFilter").value;
  const expenses = trip.expenses.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).filter(e => category === "all" || e.category === category);
  $("#expenseList").innerHTML = expenses.map(e => `<div class="expense-row">
    <div class="expense-main"><div class="expense-icon"><i data-lucide="${expenseIcon(e.category)}"></i></div><div><strong>${escapeHTML(e.purpose)}</strong><small>${escapeHTML(e.category || "Other")}${e.notes ? " · " + escapeHTML(e.notes) : ""}</small></div></div>
    <div class="expense-person">${escapeHTML(e.member || "Group member")}</div><div class="expense-date">${dateLabel((e.createdAt || "").slice(0,10),{month:"short",day:"numeric"})}</div>
    <div class="expense-amount">−${money(e.amount)}</div><button class="delete-expense" title="Remove expense (reverses deduction)" aria-label="Remove expense" data-delete-expense="${e.id}"><i data-lucide="trash-2"></i></button>
    </div>`).join("");
  $("#expenseEmpty").hidden = expenses.length > 0;
}
function renderItinerary() {
  const hasTrips = trips.length > 0;
  $("#itineraryNoTrip").hidden = hasTrips;
  $("#itineraryContent").hidden = !hasTrips;
  if (!hasTrips) return;
  if (!getTrip(activeTripId)) activeTripId = trips[0].id;
  fillTripSelect($("#itineraryTripSelect"), activeTripId);
  const trip = getTrip(activeTripId);
  $("#itinerarySummary").innerHTML = `<div class="summary-chip">Trip <strong>${escapeHTML(trip.name)}</strong></div><div class="summary-chip">Duration <strong>${daysBetween(trip.startDate,trip.endDate)} days</strong></div><div class="summary-chip">Destinations <strong>${trip.places.length}</strong></div><div class="summary-chip">Travel <strong>${escapeHTML(trip.travelMode)}</strong></div>`;
  const places = trip.places.slice().sort((a,b) => Number(a.day || 1) - Number(b.day || 1));
  $("#placeList").innerHTML = places.map(p => `<article class="place-card"><div class="place-day"><small>Day</small><strong>${Number(p.day)||1}</strong></div><div><h3>${escapeHTML(p.name || p)}</h3><p>${escapeHTML(p.notes || "Destination on your trip route.")}</p></div><button class="place-delete" data-delete-place="${p.id}" title="Remove place" aria-label="Remove place"><i data-lucide="trash-2"></i></button></article>`).join("");
  $("#placeEmpty").hidden = places.length > 0;
}
function renderAll() {
  saveTrips(); renderHome(); renderTrips(); renderVault(); renderItinerary(); refreshIcons();
}
function showView(name) {
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  $$(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $("#pageCrumb").textContent = ({home:"Dashboard",trips:"My trips",vault:"Budget vault",itinerary:"Itinerary"})[name] || "Dashboard";
  if (name === "vault") renderVault();
  if (name === "itinerary") renderItinerary();
  window.scrollTo({top:0,behavior:"smooth"});
  refreshIcons();
}
function openTripDialog() {
  $("#tripForm").reset();
  $("#tripStart").value = todayISO();
  const end = new Date(); end.setDate(end.getDate()+2);
  $("#tripEnd").value = end.toISOString().slice(0,10);
  $("#memberCount").value = 2; renderMemberInputs();
  $("#tripFormError").textContent = "";
  $("#tripDialog").showModal(); refreshIcons();
}
function renderMemberInputs() {
  const count = Math.max(1,Math.min(30,Number($("#memberCount").value) || 1));
  $("#memberCount").value = count;
  const previous = $$(".member-fields input").map(input => input.value);
  $("#memberFields").innerHTML = Array.from({length:count},(_,i) => `<input name="member${i}" aria-label="Traveller ${i+1} name" placeholder="Traveller ${i+1} name" maxlength="60" value="${escapeHTML(previous[i] || (i === 0 ? "You" : ""))}" required />`).join("");
}
function openExpenseDialog() {
  if (!trips.length) { showToast("Create a trip before adding expenses."); openTripDialog(); return; }
  fillTripSelect($("#expenseTrip"), activeTripId);
  updateExpenseMemberOptions();
  $("#expenseForm").reset();
  fillTripSelect($("#expenseTrip"), activeTripId);
  updateExpenseMemberOptions();
  $("#expenseFormError").textContent = "";
  $("#expenseDialog").showModal(); refreshIcons();
}
function updateExpenseMemberOptions() {
  const trip = getTrip($("#expenseTrip").value || activeTripId);
  $("#expenseMember").innerHTML = (trip?.members || []).map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join("");
  if (!trip?.members?.length) $("#expenseMember").innerHTML = `<option value="Group member">Group member</option>`;
}
function openPlaceDialog() {
  if (!trips.length) { showToast("Create a trip before adding destinations."); openTripDialog(); return; }
  fillTripSelect($("#placeTrip"), activeTripId);
  $("#placeDay").value = 1; $("#placeName").value = ""; $("#placeNotes").value = ""; $("#placeFormError").textContent = "";
  $("#placeDialog").showModal(); refreshIcons();
}
function bindEvents() {
  $$("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  $$("[data-goto]").forEach(button => button.addEventListener("click", () => showView(button.dataset.goto)));
  $$("[data-new-trip]").forEach(button => button.addEventListener("click", openTripDialog));
  $("#heroNewTrip").addEventListener("click", openTripDialog);
  $("#topNewTrip").addEventListener("click", openTripDialog);
  $$(".close-dialog").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
  $("#memberCount").addEventListener("input", renderMemberInputs);
  $("#tripForm").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("#tripName").value.trim();
    const startDate = $("#tripStart").value, endDate = $("#tripEnd").value;
    const budget = Number($("#tripBudget").value);
    const members = $$("#memberFields input").map(input => input.value.trim());
    if (!name || !startDate || !endDate || startDate > endDate || !Number.isFinite(budget) || budget <= 0 || members.some(m => !m)) {
      $("#tripFormError").textContent = "Enter a trip name, valid dates, a positive budget, and every traveller's name."; return;
    }
    const places = $("#tripPlaces").value.split(",").map(s => s.trim()).filter(Boolean).map((place,i) => ({id:uid(),name:place,day:Math.min(daysBetween(startDate,endDate),i+1),notes:""}));
    const trip = {id:uid(),name,startDate,endDate,members,travelMode:$("#travelMode").value,budget,places,expenses:[],status:"planned",createdAt:new Date().toISOString()};
    trip.status = tripStatus(trip);
    trips.unshift(trip); activeTripId = trip.id;
    $("#tripDialog").close(); renderAll(); showView("vault"); showToast("Trip created! Your budget vault is ready.");
  });
  $("#tripSearch").addEventListener("input", renderTrips);
  $("#tripFilter").addEventListener("change", renderTrips);
  $("#vaultAddExpense").addEventListener("click", openExpenseDialog);
  $("#expenseTrip").addEventListener("change", updateExpenseMemberOptions);
  $("#expenseForm").addEventListener("submit", event => {
    event.preventDefault();
    const trip = getTrip($("#expenseTrip").value);
    const amount = Number($("#expenseAmount").value), purpose = $("#expensePurpose").value.trim();
    if (!trip || !Number.isFinite(amount) || amount <= 0 || !purpose) { $("#expenseFormError").textContent = "Choose a trip and enter a valid amount and purpose."; return; }
    if (amount > Math.max(0,balance(trip))) {
      const confirmOverspend = window.confirm(`This expense is greater than the remaining budget (${money(balance(trip))}). Add it anyway? The vault can show a negative balance.`);
      if (!confirmOverspend) return;
    }
    trip.expenses.push({id:uid(),amount:Number(amount.toFixed(2)),purpose,category:$("#expenseCategory").value,member:$("#expenseMember").value || "Group member",notes:$("#expenseNotes").value.trim(),createdAt:new Date().toISOString()});
    activeTripId = trip.id; $("#expenseDialog").close(); renderAll(); showView("vault"); showToast(`Expense saved. Remaining balance: ${money(balance(trip))}`);
  });
  $("#vaultTripSelect").addEventListener("change", event => {activeTripId=event.target.value;renderVault();renderHome();refreshIcons();});
  $("#itineraryTripSelect").addEventListener("change", event => {activeTripId=event.target.value;renderItinerary();renderHome();refreshIcons();});
  $("#expenseCategoryFilter").addEventListener("change", renderVault);
  $("#addPlaceBtn").addEventListener("click", openPlaceDialog);
  $("#placeForm").addEventListener("submit", event => {
    event.preventDefault();
    const trip = getTrip($("#placeTrip").value), name = $("#placeName").value.trim(), day = Number($("#placeDay").value);
    if (!trip || !name || !Number.isInteger(day) || day < 1 || day > daysBetween(trip.startDate,trip.endDate)) {
      $("#placeFormError").textContent = `Enter a place and a day from 1 to ${trip ? daysBetween(trip.startDate,trip.endDate) : "the trip duration"}.`; return;
    }
    trip.places.push({id:uid(),name,day,notes:$("#placeNotes").value.trim()});
    activeTripId=trip.id; $("#placeDialog").close(); renderAll(); showView("itinerary"); showToast("Destination added to your itinerary.");
  });
  document.addEventListener("click", event => {
    const vaultButton = event.target.closest("[data-open-vault]");
    if (vaultButton) { activeTripId=vaultButton.dataset.openVault; showView("vault"); renderVault(); return; }
    const planButton = event.target.closest("[data-open-plan]");
    if (planButton) { activeTripId=planButton.dataset.openPlan; showView("itinerary"); renderItinerary(); return; }
    const deleteExpense = event.target.closest("[data-delete-expense]");
    if (deleteExpense) {
      const trip = getTrip(activeTripId), expense = trip?.expenses.find(e => e.id === deleteExpense.dataset.deleteExpense);
      if (!trip || !expense) return;
      if (!window.confirm(`Remove "${expense.purpose}" (${money(expense.amount)})? The amount will be added back to the remaining balance.`)) return;
      trip.expenses = trip.expenses.filter(e => e.id !== expense.id); renderAll(); showToast("Expense removed and balance recalculated."); return;
    }
    const deletePlace = event.target.closest("[data-delete-place]");
    if (deletePlace) {
      const trip = getTrip(activeTripId);
      if (!trip || !window.confirm("Remove this destination from the itinerary?")) return;
      trip.places = trip.places.filter(p => p.id !== deletePlace.dataset.deletePlace); renderAll(); showToast("Destination removed.");
    }
  });
}
updateStatuses();
bindEvents();
renderAll();
