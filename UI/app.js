// ================================
// EVENTFLOW - SHARED DEMO STATE
// ================================

const ROUTES = {
  "live-map": "live-map.html",
  "ai-sandbox": "ai-sandbox.html",
  updates: "updates.html",
  reports: "reports.html",
  settings: "live-map.html",
};

// ----------------
// Shared app state
// ----------------

function getState() {
  const saved = localStorage.getItem("eventflow-state");

  if (saved) {
    return JSON.parse(saved);
  }

  const initialState = {
    incidentDetected: true,
    disruption: "Heavy Rain",
    affectedArea: "Attraction B",

    visitors: 80000,
    displacedVisitors: 12000,

    venueCurrent: 61,
    venuePredicted: 94,

    transitCurrent: 68,
    transitPredicted: 91,

    emergencyCurrent: 35,
    emergencyPredicted: "HIGH",

    overcrowdingMinutes: 42,

    selectedStrategy: null,
    simulationCompleted: false,
    responseApproved: false,
    stakeholdersUpdated: false,

    finalVenue: 69,
    finalTransit: 64,
    finalAttractionC: 72,
    finalEmergency: "MEDIUM",

    crowdReduction: 47,
    residualRisk: "LOW",
  };

  saveState(initialState);

  return initialState;
}

function saveState(state) {
  localStorage.setItem("eventflow-state", JSON.stringify(state));
}

let eventState = getState();

// ================================
// NAVIGATION
// ================================

document.querySelectorAll("[data-path]").forEach((element) => {
  element.addEventListener("click", (e) => {
    e.preventDefault();

    const path = element.dataset.path;

    if (!ROUTES[path]) return;

    // Updates should ideally follow approval
    if (path === "updates" && !eventState.responseApproved) {
      const continueAnyway = confirm(
        "No response has been approved yet.\n\nOpen AI Sandbox first?"
      );

      if (continueAnyway) {
        window.location.href = ROUTES["ai-sandbox"];
      }

      return;
    }

    window.location.href = ROUTES[path];
  });
});

// ================================
// LIVE MAP
// ================================

const aiResponseButtons = document.querySelectorAll(
  '[data-path="ai-sandbox"]'
);

aiResponseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    eventState.incidentDetected = true;

    saveState(eventState);
  });
});

// ================================
// AI SANDBOX
// ================================

function setupSimulationButtons() {
  const buttons = [...document.querySelectorAll("button")].filter((button) =>
    button.textContent.includes("Simulate Strategy")
  );

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const strategies = ["A", "B", "C"];

      const strategy = strategies[index] || "C";

      eventState.selectedStrategy = strategy;
      eventState.simulationCompleted = true;

      saveState(eventState);

      buttons.forEach((btn) => {
        btn.disabled = false;
        btn.style.opacity = "1";
      });

      button.disabled = true;
      button.style.opacity = "0.7";

      button.innerHTML = `
        <span class="material-symbols-outlined text-[18px]">
          check_circle
        </span>
        <span>Strategy ${strategy} Simulated</span>
      `;

      // Strategy C is our recommended hackathon scenario
      if (strategy === "C") {
        showSimulationToast();
      }
    });
  });
}

function showSimulationToast() {
  const toast = document.createElement("div");

  toast.innerHTML = `
    <div
      style="
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 9999;
        background: white;
        border-radius: 14px;
        padding: 16px 20px;
        box-shadow: 0 12px 35px rgba(0,0,0,.18);
        border-left: 5px solid #006242;
        font-family: Inter, sans-serif;
        max-width: 360px;
      "
    >
      <div style="font-weight:700;margin-bottom:5px;">
        ✓ Strategy C simulation completed
      </div>

      <div style="font-size:14px;color:#565e74;">
        Crowd pressure reduced by 47% with LOW residual risk.
      </div>
    </div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

setupSimulationButtons();

// ================================
// APPROVE RESPONSE
// ================================

const approveButton = document.getElementById("approve-btn");

if (approveButton) {
  approveButton.addEventListener("click", () => {
    eventState.selectedStrategy = "C";
    eventState.simulationCompleted = true;
    eventState.responseApproved = true;
    eventState.stakeholdersUpdated = true;

    saveState(eventState);

    approveButton.innerHTML = `
      <span class="material-symbols-outlined text-[18px]">
        task_alt
      </span>
      <span>Response Approved</span>
    `;

    approveButton.style.background = "#006242";

    approveButton.disabled = true;

    setTimeout(() => {
      window.location.href = "updates.html";
    }, 900);
  });
}

// ================================
// UPDATES PAGE
// ================================

function setupUpdatesPage() {
  const title = document.querySelector("h1");

  if (!title) return;

  if (title.textContent.trim() !== "Response Updates") return;

  if (!eventState.responseApproved) {
    const warning = document.createElement("div");

    warning.innerHTML = `
      <div
        style="
          margin-bottom:20px;
          background:#fff3cd;
          color:#664d03;
          padding:14px 18px;
          border-radius:10px;
          font-family:Inter,sans-serif;
        "
      >
        No organizer response has been approved yet.
      </div>
    `;

    const main = document.querySelector("main");

    if (main) {
      main.prepend(warning);
    }
  }
}

setupUpdatesPage();

// ================================
// REPORT GENERATION
// ================================

function generateIncidentReport() {
  const report = `
EVENTFLOW — INCIDENT RESPONSE REPORT

Event:
Mumbai Mega Event

Incident:
Heavy Rain — Attraction B

--------------------------------------------------

INCIDENT DETECTED

Heavy rain reduced Attraction B outdoor capacity.

Visitors potentially displaced:
12,000

Predicted overcrowding:
42 minutes

--------------------------------------------------

WITHOUT INTERVENTION

Venue A:
61% → 94%

Transit A:
68% → 91%

Emergency Pressure:
35% → HIGH

--------------------------------------------------

AI STRATEGIES

Strategy A
Redirect Visitors
Crowd Reduction: 18%

Strategy B
Redirect + Add Shuttles
Crowd Reduction: 31%

Strategy C
Coordinated Redistribution
Crowd Reduction: 47%

--------------------------------------------------

SANDBOX RESULT

Selected Strategy:
Strategy C

Venue A:
94% → 69%

Transit A:
91% → 64%

Attraction C:
38% → 72%

Emergency Pressure:
HIGH → MEDIUM

Residual Risk:
LOW

Constraint Validation:
PASSED

--------------------------------------------------

ORGANIZER DECISION

Response Approved:
${eventState.responseApproved ? "YES" : "NO"}

--------------------------------------------------

STAKEHOLDER COORDINATION

Transportation:
UPDATED

Hospitality & Providers:
UPDATED

Travelers:
UPDATED

--------------------------------------------------

EventFlow
Predict → Alert → Optimize → Sandbox
→ Human Approval → Orchestrate → Notify
  `;

  const blob = new Blob([report], {
    type: "text/plain",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = "EventFlow-Incident-Report.txt";

  a.click();

  URL.revokeObjectURL(url);
}
function getDirections() {

    const screen =
        document.getElementById("travelerScreen");

    screen.innerHTML = `
        <div style="
            display:flex;
            align-items:center;
            gap:8px;
            color:#08764d;
            font-weight:700;
            margin-bottom:14px;
        ">
            <span class="material-symbols-outlined">
                check_circle
            </span>

            Route Updated
        </div>

        <div style="
            font-size:12px;
            color:#657084;
            margin-bottom:5px;
        ">
            Recommended Destination
        </div>

        <strong style="
            font-size:18px;
            color:#102034;
        ">
            Attraction C — Indoor Pavilion
        </strong>

        <div style="
            margin-top:15px;
            padding:12px;
            border-radius:10px;
            background:#f0f5fc;
        ">

            <div style="
                display:flex;
                justify-content:space-between;
                margin-bottom:10px;
            ">

                <span>
                    Travel Time
                </span>

                <strong>
                    14 min
                </strong>

            </div>

            <div style="
                display:flex;
                justify-content:space-between;
                margin-bottom:10px;
            ">

                <span>
                    Crowd Level
                </span>

                <strong style="color:#08764d;">
                    LOW
                </strong>

            </div>

            <div style="
                display:flex;
                justify-content:space-between;
            ">

                <span>
                    Route
                </span>

                <strong>
                    South Terminal
                </strong>

            </div>

        </div>

        <div style="
            margin-top:12px;
            padding:10px;
            border-radius:8px;
            background:#eaf2ff;
            color:#536176;
            font-size:12px;
            line-height:1.5;
        ">
            ✓ Avoiding Transit A congestion<br>
            ✓ Sheltered route recommended<br>
            ✓ Attraction B closure bypassed
        </div>

        <button
            class="btn btn-secondary btn-full"
            style="margin-top:12px;"
            onclick="resetDirections()">
            Back
        </button>
    `;

    showToast(
        "Route updated",
        "Traveler redirected safely to Attraction C."
    );
}


function resetDirections() {

    const screen =
        document.getElementById("travelerScreen");

    screen.innerHTML = `
        <strong style="color:#b3261e;">
            ⚠ Attraction B affected by rain
        </strong>

        <p>
            Recommended Alternative:
        </p>

        <strong>
            Indoor Pavilion C
        </strong>

        <p>
            Crowd:
            <strong style="color:#08764d;">
                LOW
            </strong>
        </p>

        <p>
            Travel:
            <strong>
                14 min
            </strong>
        </p>

        <button
            class="btn btn-primary btn-full"
            onclick="getDirections()">
            Get Directions
        </button>
    `;
}

// Find Download Report button automatically
document.querySelectorAll("button, a").forEach((element) => {
  if (
    element.textContent
      .toLowerCase()
      .includes("download report")
  ) {
    element.addEventListener("click", (e) => {
      e.preventDefault();

      generateIncidentReport();
    });
  }
});

// ================================
// DEMO RESET
// ================================

// Press CTRL + SHIFT + R to reset EventFlow demo state
document.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey &&
    event.shiftKey &&
    event.key.toLowerCase() === "r"
  ) {
    event.preventDefault();

    localStorage.removeItem("eventflow-state");

    alert("EventFlow demo reset.");

    window.location.href = "live-map.html";
  }
});