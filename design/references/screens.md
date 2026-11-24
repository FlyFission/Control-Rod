# The visual bar, screen by screen

Each row is a pass or fail test that a reviewer applies to a screenshot. The numbers in the last column point to the references in [README.md](README.md). A visual change passes when every row for the screens it touches passes, at 1440 px wide and at 390 px on a phone, and the owner says yes to the screenshots.

## Whole app

| State | Bar (pass or fail) | Borrow from |
|---|---|---|
| Any screen | A cropped screenshot of any screen is recognisably Control Rod: one signature element (the instrument frame, the rod gauge, the annunciator) appears everywhere | 3 |
| Healthy | Colour appears only for something abnormal or something you can act on; the normal state is near-monochrome | Real control rooms, 1 |
| Something needs you | The one thing waiting on you is the only warm-coloured object on screen | 1, 9 |
| Motion | Motion always means something is running or changing; nothing animates for decoration; all of it stops with reduced motion and in a hidden tab | 8 |
| Type | Hierarchy comes from the type scale and weight, not from boxes and borders | 9, 6 |

## Plant

| State | Bar (pass or fail) | Borrow from |
|---|---|---|
| Normal | In 5 seconds a newcomer can say how many agents are working and what needs them | 1, 4 |
| Normal | The reactor fills at least a quarter of the canvas, is the brightest object on screen, and the rooms are arranged around it | 7 |
| Normal | Rooms are illustrated spaces with stations, not labelled rectangles | 5 |
| Empty (0 agents) | A 200 px thumbnail of the empty plant is clearly different from a busy one: rooms dark, core cold, no flow | 7, 8 |
| Busy (40 agents) | Each agent is a figure at a station with its CLI's icon and its task name, not an ID token | 5 |
| Flow | Work moving between rooms is drawn as motion along lines, so you can see the pipeline running | 8 |
| Needs you | The room that needs you lights and pulses; the annunciator window and the room are visibly linked | 4, 1 |
| About to need you | Work that will need you soon (a check finishing, a budget running low) is marked before it happens | 4 |
| Stuck | The stuck room looks broken (warning lamp, flicker, dimmed station), not just a red square | 5 |
| SCRAM (real) | The whole screen changes within 1 second: rods drop on the gauge, core turns red, chrome locks, hazard banner shows | 5, 3 |
| Drill | Unmistakably a drill: a striped "DRILL" overlay; never the real trip palette | Real control rooms |
| Phone | A designed phone layout (core, annunciator, then the list), not the desktop squeezed; no sideways scroll | 2 |

## Board

| State | Bar (pass or fail) | Borrow from |
|---|---|---|
| Empty | A designed empty state that teaches the one action (add a card), not a dashed box | 6 |
| Busy | Lists are dense and quiet; card titles carry the hierarchy; one accent colour | 9 |
| Running | A running card shows a live status line in plain words and a moving progress cue | 1 |
| Waiting on you | Cards waiting on you are the only warm-coloured cards, and they sort first | 1, 9 |
| Agents | Every card shows the icon of the agent working it, and of the checker | 5 |
| Card open | The drawer reads like a cockpit: status, run log, diff and the decision on one screen at 1440 without scrolling | 3 |

## Today

| State | Bar (pass or fail) | Borrow from |
|---|---|---|
| Morning | Reads as a shift brief: one headline sentence, at most 3 numbers, then what needs you; all above the fold | 1, 2 |
| Nothing needs you | A calm, finished-looking state that feels like a reward | 6 |

## Inbox

| State | Bar (pass or fail) | Borrow from |
|---|---|---|
| Has items | Riskiest first, with a visible risk band per item | 4 |
| Signing | Signing feels weighty: the bound revision and digest shown like an instrument readout before the button | 3 |
| Empty | Calm and finished, not blank | 6 |

## Sign in

| State | Bar (pass or fail) | Borrow from |
|---|---|---|
| First visit | Sets the mood in one frame: the plant at night behind the sign-in panel | 7 |

## Setup and Agents roster

| State | Bar (pass or fail) | Borrow from |
|---|---|---|
| First run | Each detected agent lights up as a seat at the table with its icon, then the three-way confirm | 5 |
| Roster | The council shown as seats with toggles, status and usage left, not a settings list | 5, 3 |
