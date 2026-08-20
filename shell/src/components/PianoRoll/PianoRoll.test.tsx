import { useState } from "react";
import { render, screen, userEvent } from "@test-utils";
import { PianoRoll } from "./PianoRoll";
import { defaultPianoRollView, type PianoRollViewState } from "./model";

const notes = [
  { id: "c4", start: 0, duration: 1, pitchMidicents: 6000, label: "C4" },
  { id: "micro-g", start: 1, duration: 0.5, pitchMidicents: 6650, label: "G4 -50c" },
];

function Harness({ initial = defaultPianoRollView }: { initial?: PianoRollViewState }) {
  const [view, setView] = useState(initial);
  return (
    <>
      <PianoRoll
        notes={notes}
        duration={4}
        gridLines={[
          { at: 0, kind: "bar", label: "1" },
          { at: 1, kind: "beat" },
          { at: 2, kind: "beat" },
          { at: 3, kind: "beat" },
          { at: 4, kind: "bar", label: "2" },
        ]}
        view={view}
        onViewChange={setView}
        playhead={1.25}
        ariaLabel="Reusable piano roll"
      />
      <output data-testid="view">{JSON.stringify(view)}</output>
    </>
  );
}

describe("PianoRoll", () => {
  it("renders arbitrary-duration and microtonal notes on a musical grid", () => {
    render(<Harness initial={{ ...defaultPianoRollView, framed: true }} />);
    expect(screen.getByRole("img", { name: "Reusable piano roll; 2 notes" })).toBeInTheDocument();
    expect(screen.getByTitle("C4 · 0.000 qn · 1.000 qn")).toBeInTheDocument();
    expect(screen.getByTitle("G4 -50c · 1.000 qn · 0.500 qn")).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "span" })).toBeInTheDocument();
  });

  it("exposes independent zoom and playback-follow controls", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...defaultPianoRollView, framed: true }} />);
    await user.click(screen.getByRole("button", { name: "Zoom in in time" }));
    expect(JSON.parse(screen.getByTestId("view").textContent ?? "{}").pixelsPerQuarter).toBe(80);
    await user.click(screen.getByRole("button", { name: "Zoom in in pitch" }));
    expect(JSON.parse(screen.getByTestId("view").textContent ?? "{}").pixelsPerSemitone).toBe(27.5);
    await user.click(screen.getByRole("switch", { name: "Follow playback" }));
    const view = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as PianoRollViewState;
    expect(view.pixelsPerQuarter).toBe(80);
    expect(view.pixelsPerSemitone).toBe(27.5);
    expect(view.followPlayback).toBe(true);
  });
});
