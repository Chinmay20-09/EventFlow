import type { ThemeClasses } from "../theme"

type Props = {
  themeClasses: ThemeClasses
  selectedStrategy: string | null
  selectedNode: string
  onSelectNode: (node: string) => void
  onShare: () => void
  northGateCrowd: number
  eastZoneCrowd: number
  transitCapacity: number
}

export default function LiveCrowdMap({
  themeClasses,
  selectedStrategy,
  selectedNode,
  onSelectNode,
  onShare,
  northGateCrowd,
  eastZoneCrowd,
  transitCapacity,
}: Props) {
  return (
    <div className={themeClasses("xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5")}>
      <div className={themeClasses("flex items-center justify-between mb-4")}>
        <div>
          <h3 className={themeClasses("text-lg font-semibold")}>Live Crowd Map</h3>

          <p className={themeClasses("text-sm text-slate-400")}>
            Current crowd distribution across event zones
          </p>
          {selectedStrategy && (
            <span className={themeClasses("inline-block mt-2 text-xs text-blue-300")}>
              Simulation active: Strategy {selectedStrategy}
            </span>
          )}
        </div>

        <div className={themeClasses("flex items-center gap-2")}>
          <span className={themeClasses("text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400")}>
            {selectedStrategy ? "SIMULATION" : "LIVE DATA"}
          </span>

          <button
            onClick={onShare}
            className={themeClasses("text-xs px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500")}
          >
            Share Map
          </button>
        </div>
      </div>

      <div className={themeClasses("bg-slate-800 rounded-xl p-4")}>
        <svg viewBox="0 0 600 320" className={themeClasses("w-full h-auto map")}>
          {/* Background */}
          <rect width="600" height="320" rx="18" fill="#EEF5FB" />

          {/* Arabian Sea */}
          <path d="M0 0 L85 0 L72 40 L84 90 L68 150 L80 220 L65 320 L0 320 Z" fill="#A9D6F5" />
          <text x="14" y="160" fontSize="12" fill="#0369A1" fontWeight="700">
            Arabian Sea
          </text>

          {/* PARK */}
          <rect x="355" y="18" width="95" height="48" rx="12" fill="#D8F5D6" />
          <text x="402" y="45" textAnchor="middle" fontSize="10" fill="#166534" fontWeight="600">
            Park
          </text>

          {/* GARDEN */}
          <rect x="155" y="205" width="95" height="46" rx="12" fill="#DCFCE7" />
          <text x="202" y="232" textAnchor="middle" fontSize="10" fill="#166534" fontWeight="600">
            Garden
          </text>

          {/* FOOD COURT */}
          <rect
            x="145"
            y="88"
            width="105"
            height="60"
            rx="12"
            fill="#FDE7C7"
            stroke="#FB923C"
            strokeWidth="1.5"
          />
          <text x="197" y="108" textAnchor="middle" fontSize="18">
            🍴
          </text>
          <text x="197" y="128" textAnchor="middle" fontSize="10" fill="#9A3412" fontWeight="700">
            Food Court
          </text>

          {/* PARKING */}
          <rect
            x="125"
            y="255"
            width="95"
            height="42"
            rx="10"
            fill="#DCE7F7"
            stroke="#60A5FA"
            strokeWidth="1.5"
          />
          <text x="172" y="272" textAnchor="middle" fontSize="18">
            🅿
          </text>
          <text x="172" y="286" textAnchor="middle" fontSize="10" fill="#1D4ED8" fontWeight="700">
            Parking
          </text>

          {/* ================= ROADS ================= */}

          {/* White roads */}
          <g stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" fill="none">
            {/* Marine Drive (moved below food court) */}
            <path d="M95 245 C160 185,255 165,470 175" />

            {/* Metro Line */}
            <path d="M245 20 L242 170 L295 225" />

            {/* Transit Road */}
            <path d="M430 250 L445 170 L420 20" />
          </g>

          {/* Dashed road markings */}
          <g stroke="#CBD5E1" strokeWidth="2" strokeDasharray="6 6" fill="none">
            <path d="M95 245 C160 185,255 165,470 175" />
            <path d="M245 20 L242 170 L295 225" />
            <path d="M430 250 L445 170 L420 20" />
          </g>

          {/* Road labels */}
          <g fontSize="9" fill="#64748B" fontWeight="700">
            <text x="228" y="158">
              Marine Drive
            </text>
            <text transform="translate(252 92) rotate(-90)">Metro Line</text>
            <text transform="translate(455 135) rotate(-78)">Transit Road</text>
          </g>

          {/* Pedestrian connections */}
          <g stroke="#64748B" strokeWidth="1.5" strokeDasharray="4 5">
            <line x1="235" y1="70" x2="330" y2="170" />
            <line x1="430" y1="90" x2="330" y2="170" />
            <line x1="430" y1="250" x2="330" y2="170" />
          </g>

          {/* ================= STAGE ================= */}

          <ellipse
            cx="330"
            cy="170"
            rx="55"
            ry="36"
            fill="#DBEAFE"
            stroke="#3B82F6"
            strokeWidth="2"
          />
          <ellipse cx="330" cy="170" rx="42" ry="26" fill="#3B82F6" />

          {/* Hover expansion */}
          {selectedNode === "B" && (
            <>
              <ellipse
                cx="330"
                cy="170"
                rx="68"
                ry="44"
                fill="none"
                stroke="#60A5FA"
                strokeWidth="2"
                opacity="0.6"
              />
              <text
                x="330"
                y="152"
                textAnchor="middle"
                fontSize="11"
                fill="white"
                fontWeight="700"
              >
                STAGE
              </text>
            </>
          )}

          {/* ================= GATE LABELS ================= */}

          <g>
            <rect x="145" y="18" width="84" height="24" rx="8" fill="#1E3A8A" />
            <text x="187" y="33" textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
              North Gate
            </text>

            <rect x="420" y="18" width="82" height="24" rx="8" fill="#1E3A8A" />
            <text x="461" y="33" textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
              East Gate
            </text>

            <rect x="245" y="286" width="84" height="24" rx="8" fill="#1E3A8A" />
            <text x="287" y="301" textAnchor="middle" fontSize="9" fill="white" fontWeight="700">
              South Gate
            </text>
          </g>

          {/* ================= NODE A ================= */}
          <g onClick={() => onSelectNode("A")} style={{ cursor: "pointer" }}>
            <circle
              cx="235"
              cy="70"
              r="18"
              fill={selectedNode === "A" ? "#DC2626" : "#F87171"}
              stroke="white"
              strokeWidth="3"
            />
            <text x="235" y="75" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">
              A
            </text>

            <rect x="185" y="92" width="100" height="20" rx="8" fill="rgba(255,255,255,.82)" />
            <text x="235" y="105" textAnchor="middle" fontSize="9" fill="#7F1D1D" fontWeight="600">
              North Gate
            </text>
          </g>

          {/* ================= NODE B ================= */}
          <g onClick={() => onSelectNode("B")} style={{ cursor: "pointer" }}>
            <circle
              cx="330"
              cy="170"
              r={selectedNode === "B" ? 26 : 22}
              fill={selectedNode === "B" ? "#2563EB" : "#60A5FA"}
              stroke="white"
              strokeWidth="3"
              style={{ transition: "0.25s" }}
            />
            <text x="330" y="176" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">
              B
            </text>

            <rect x="278" y="198" width="104" height="20" rx="8" fill="rgba(255,255,255,.82)" />
            <text x="330" y="211" textAnchor="middle" fontSize="9" fill="#1D4ED8" fontWeight="600">
              Central Zone
            </text>
          </g>

          {/* ================= NODE C ================= */}
          <g onClick={() => onSelectNode("C")} style={{ cursor: "pointer" }}>
            <circle
              cx="430"
              cy="90"
              r="18"
              fill={selectedNode === "C" ? "#16A34A" : "#4ADE80"}
              stroke="white"
              strokeWidth="3"
            />
            <text x="430" y="95" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">
              C
            </text>

            <rect x="380" y="112" width="100" height="20" rx="8" fill="rgba(255,255,255,.82)" />
            <text x="430" y="125" textAnchor="middle" fontSize="9" fill="#166534" fontWeight="600">
              East Zone
            </text>
          </g>

          {/* ================= NODE D ================= */}
          <g onClick={() => onSelectNode("D")} style={{ cursor: "pointer" }}>
            <circle
              cx="430"
              cy="250"
              r="18"
              fill={selectedNode === "D" ? "#0EA5E9" : "#38BDF8"}
              stroke="white"
              strokeWidth="3"
            />
            <text x="430" y="255" textAnchor="middle" fontSize="11" fill="white" fontWeight="700">
              D
            </text>

            <rect x="380" y="272" width="100" height="20" rx="8" fill="rgba(255,255,255,.82)" />
            <text x="430" y="285" textAnchor="middle" fontSize="9" fill="#075985" fontWeight="600">
              Transit Hub
            </text>
          </g>

          {/* ================= LEGEND ================= */}
          <g transform="translate(475 205)">
            <rect width="110" height="95" rx="10" fill="rgba(255,255,255,.92)" stroke="#D1D5DB" />

            <line x1="10" y1="18" x2="28" y2="18" stroke="#64748B" strokeDasharray="4 4" strokeWidth="2" />
            <text x="35" y="21" fontSize="8" fill="#334155">
              Paths
            </text>

            <rect x="10" y="30" width="10" height="10" rx="2" fill="#D8F5D6" />
            <text x="35" y="38" fontSize="8" fill="#334155">
              Park
            </text>

            <rect x="10" y="46" width="10" height="10" rx="2" fill="#FDE7C7" />
            <text x="35" y="54" fontSize="8" fill="#334155">
              Food
            </text>

            <rect x="10" y="62" width="10" height="10" rx="2" fill="#DCE7F7" />
            <text x="35" y="70" fontSize="8" fill="#334155">
              Parking
            </text>

            <circle cx="15" cy="84" r="5" fill="#2563EB" />
            <text x="35" y="87" fontSize="8" fill="#334155">
              Zone
            </text>
          </g>

          {/* Compass */}
          <g transform="translate(555 18)">
            <circle r="12" fill="white" stroke="#64748B" />
            <path d="M0 -8 L3 3 L0 1 L-3 3 Z" fill="#1E40AF" />
            <text y="-16" textAnchor="middle" fontSize="7" fill="#334155" fontWeight="700">
              N
            </text>
          </g>
        </svg>

        <div className={themeClasses("mt-4 bg-slate-900 rounded-lg p-4")}>
          <p className={themeClasses("text-xs text-slate-400 uppercase")}>Selected Dropper</p>

          <h4 className={themeClasses("text-lg font-semibold mt-1")}>
            {selectedNode === "A" && "North Gate"}
            {selectedNode === "B" && "Central Zone"}
            {selectedNode === "C" && "East Zone"}
            {selectedNode === "D" && "Transit Hub"}
          </h4>

          <div className={themeClasses("grid grid-cols-3 gap-3 mt-3")}>
            <div>
              <p className={themeClasses("text-xs text-slate-500")}>Utilization</p>
              <p className={themeClasses("font-bold")}>
                {selectedNode === "A" && `${northGateCrowd}%`}
                {selectedNode === "B" && "78%"}
                {selectedNode === "C" && `${eastZoneCrowd}%`}
                {selectedNode === "D" && `${transitCapacity}%`}
              </p>
            </div>

            <div>
              <p className={themeClasses("text-xs text-slate-500")}>Status</p>
              <p className={themeClasses("font-bold")}>
                {selectedNode === "A" && "Critical"}
                {selectedNode === "B" && "Busy"}
                {selectedNode === "C" && "Low"}
                {selectedNode === "D" && "Stable"}
              </p>
            </div>

            <div>
              <p className={themeClasses("text-xs text-slate-500")}>Node</p>
              <p className={themeClasses("font-bold")}>{selectedNode}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
