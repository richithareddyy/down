"use client";
import { useState } from "react";
import type { Conditions, Day } from "../src/domain/types";
const days: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export function ConditionEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Conditions;
  onSave: (conditions: Conditions) => void;
  onCancel: () => void;
}) {
  const [c, set] = useState<Conditions>(structuredClone(initial));
  return (
    <form
      className="condition-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(c);
      }}
    >
      <label>
        activity
        <select
          value={c.activityTags[0]}
          onChange={(e) => set({ ...c, activityTags: [e.target.value] })}
        >
          <option value="dance">dance</option>
          <option value="music">music / open mic</option>
          <option value="climbing">climbing</option>
        </select>
      </label>
      <div className="field-pair">
        <label>
          max budget ($)
          <input
            type="number"
            min="0"
            max="10000"
            step="0.01"
            value={c.maxPrice ?? ""}
            placeholder="any"
            onChange={(e) =>
              set({
                ...c,
                maxPrice:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          min people
          <input
            type="number"
            min="1"
            max="4"
            value={c.minGroupSize ?? 1}
            onChange={(e) =>
              set({ ...c, minGroupSize: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <label>
        ends before
        <input
          type="time"
          value={c.endsBefore ?? ""}
          onChange={(e) =>
            set({ ...c, endsBefore: e.target.value || undefined })
          }
        />
      </label>
      <fieldset>
        <legend>days · none selected means any</legend>
        <div className="day-picker">
          {days.map((day) => (
            <button
              type="button"
              key={day}
              aria-pressed={c.days?.includes(day) ?? false}
              onClick={() => {
                const next = c.days?.includes(day)
                  ? c.days.filter((d) => d !== day)
                  : [...(c.days ?? []), day];
                set({ ...c, days: next.length ? next : undefined });
              }}
            >
              {day[0]}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={c.beginnerOnly ?? false}
          onChange={(e) => set({ ...c, beginnerOnly: e.target.checked })}
        />
        beginner-friendly only
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={c.requireApprovedFriend ?? false}
          onChange={(e) =>
            set({ ...c, requireApprovedFriend: e.target.checked })
          }
        />
        with an approved friend
      </label>
      <div className="button-row">
        <button className="small primary" type="submit">
          save conditions
        </button>
        <button className="small subtle" type="button" onClick={onCancel}>
          cancel
        </button>
      </div>
    </form>
  );
}
export function ConditionSummary({
  conditions: c,
}: {
  conditions: Conditions;
}) {
  return (
    <div className="condition-tags">
      <span>{c.activityTags.join(" / ")}</span>
      {c.beginnerOnly && <span>beginner-friendly</span>}
      {c.maxPrice !== undefined && <span>max ${c.maxPrice}</span>}
      {c.minGroupSize !== undefined && <span>{c.minGroupSize}+ people</span>}
      {c.requireApprovedFriend && <span>an approved friend</span>}
      {c.days && <span>{c.days.join(", ")}</span>}
      {c.endsBefore && <span>ends before {c.endsBefore}</span>}
    </div>
  );
}
