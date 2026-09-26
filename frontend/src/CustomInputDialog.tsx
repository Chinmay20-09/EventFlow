/**
 * Custom Input feature (P4): button + modal form + display of the stored record.
 *
 * Flow (the database is the source of truth — never React state as proof):
 *   User input → POST /api/events (P3) → PostgreSQL → GET /api/events/{id}
 *   → React state → UI
 *
 * Styling reuses the App's existing modal patterns via `themeClasses`.
 */

import { useState } from "react"
import type { FormEvent } from "react"
import { createCustomEvent, getStoredEvent } from "./api"
import type { ApiError, StoredEvent } from "./api"

type Props = {
  /** App theme helper so the dialog matches the existing design. */
  themeClasses: (classes: string) => string
  isDark: boolean
  /** Called with the re-fetched stored record after a successful save. */
  onStored?: (record: StoredEvent) => void
}

type Status = "idle" | "submitting" | "saved"

export default function CustomInputDialog({ themeClasses, isDark, onStored }: Props) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [stored, setStored] = useState<StoredEvent | null>(null)

  // Controlled state for every field (existing controlled-input convention).
  const [name, setName] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")

  const resetForm = () => {
    setName("")
    setDate("")
    setStartTime("")
    setEndTime("")
  }

  const closeDialog = () => {
    setOpen(false)
    setError(null)
    setStatus("idle")
    setStored(null)
    resetForm()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Client-side validation mirroring the P3 EventCreate contract.
    const trimmedName = name.trim()
    if (!trimmedName || !date || !startTime || !endTime) {
      setError("All fields are required.")
      return
    }
    const start = new Date(`${date}T${startTime}`)
    const end = new Date(`${date}T${endTime}`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Invalid date or time.")
      return
    }
    if (end <= start) {
      setError("End time must be after start time.")
      return
    }

    setError(null)
    setStatus("submitting")
    try {
      // 1. POST the actual user-entered values to P3.
      const created = await createCustomEvent({
        name: trimmedName,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      // 2. Fetch the record BACK from P3 (PostgreSQL is the source of truth —
      //    the submitted React state is never displayed as proof).
      const fetched = await getStoredEvent(created.event_id)
      if (fetched.name !== created.name) {
        throw {
          code: "VERIFY_FAILED",
          message: "Stored record does not match the submitted values.",
        } as ApiError
      }
      setStored(fetched)
      setStatus("saved")
      // Lift the fetched record into the dashboard so the Overview page can
      // display the backend-stored data outside the modal too.
      onStored?.(fetched)
    } catch (submitError) {
      const apiError = submitError as ApiError
      setError(apiError?.message ?? "Submission failed.")
      setStatus("idle")
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={themeClasses("px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium")}
      >
        Custom Input
      </button>

      {open && (
        <div className={themeClasses("fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50")}>
          <div className={themeClasses("w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-7")}>
            <div className={themeClasses("flex items-center justify-between mb-6")}>
              <div>
                <p className={themeClasses("text-blue-400 text-sm font-medium")}>CUSTOM INPUT</p>
                <h2 className={themeClasses("text-2xl font-bold mt-1")}>Enter event data</h2>
                <p className={themeClasses("text-slate-400 text-sm mt-1")}>
                  Stored in PostgreSQL through the EventFlow backend.
                </p>
              </div>
              <button type="button" onClick={closeDialog} className={themeClasses("text-slate-400 hover:text-white text-2xl")}>
                ×
              </button>
            </div>

            {status !== "saved" ? (
              <form onSubmit={handleSubmit}>
                <div className={themeClasses("space-y-4")}>
                  <div>
                    <label className={themeClasses("text-sm text-slate-300")} htmlFor="custom-input-name">
                      Event name
                    </label>
                    <input
                      id="custom-input-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. EV-CUSTOM-INPUT-001"
                      className={`w-full mt-2 rounded-lg px-4 py-3 outline-none focus:border-blue-500 ${themeClasses("bg-slate-800 border border-slate-700")} ${isDark ? "text-white" : "text-slate-900"}`}
                    />
                  </div>

                  <div>
                    <label className={themeClasses("text-sm text-slate-300")} htmlFor="custom-input-date">
                      Event date
                    </label>
                    <input
                      id="custom-input-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={`w-full mt-2 rounded-lg px-4 py-3 outline-none focus:border-blue-500 ${themeClasses("bg-slate-800 border border-slate-700")} ${isDark ? "text-white" : "text-slate-900"}`}
                    />
                  </div>

                  <div className={themeClasses("grid grid-cols-2 gap-4")}>
                    <div>
                      <label className={themeClasses("text-sm text-slate-300")} htmlFor="custom-input-start">
                        Start time
                      </label>
                      <input
                        id="custom-input-start"
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className={`w-full mt-2 rounded-lg px-4 py-3 outline-none focus:border-blue-500 ${themeClasses("bg-slate-800 border border-slate-700")} ${isDark ? "text-white" : "text-slate-900"}`}
                      />
                    </div>

                    <div>
                      <label className={themeClasses("text-sm text-slate-300")} htmlFor="custom-input-end">
                        End time
                      </label>
                      <input
                        id="custom-input-end"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className={`w-full mt-2 rounded-lg px-4 py-3 outline-none focus:border-blue-500 ${themeClasses("bg-slate-800 border border-slate-700")} ${isDark ? "text-white" : "text-slate-900"}`}
                      />
                    </div>
                  </div>

                  {error && <p className={themeClasses("text-red-400 text-sm")}>{error}</p>}

                  <div className={themeClasses("flex justify-end gap-3 pt-2")}>
                    <button
                      type="button"
                      onClick={closeDialog}
                      disabled={status === "submitting"}
                      className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40")}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={status === "submitting"}
                      className={themeClasses("px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium")}
                    >
                      {status === "submitting" ? "Saving…" : "Submit"}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div data-testid="custom-input-stored">
                <div className={themeClasses("bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-400")}>
                  Saved to the database and fetched back from the backend.
                </div>

                <div className={themeClasses("mt-4 bg-slate-800/60 rounded-xl p-5 space-y-2")}>
                  <p className={themeClasses("text-xs text-slate-500 uppercase")}>Stored backend record</p>
                  <p className={themeClasses("text-lg font-semibold")}>
                    #{stored?.event_id} — {stored?.name}
                  </p>
                  <p className={themeClasses("text-sm text-slate-300")}>
                    Status: {stored?.status}
                  </p>
                  <p className={themeClasses("text-sm text-slate-300")}>
                    {stored?.start_time} → {stored?.end_time}
                  </p>
                </div>

                <div className={themeClasses("flex justify-end gap-3 mt-6")}>
                  <button
                    type="button"
                    onClick={() => {
                      setStatus("idle")
                      setStored(null)
                      resetForm()
                    }}
                    className={themeClasses("px-5 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800")}
                  >
                    New entry
                  </button>
                  <button
                    type="button"
                    onClick={closeDialog}
                    className={themeClasses("px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium")}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
