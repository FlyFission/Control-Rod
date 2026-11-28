(() => {
  "use strict";

  // 1. Hero Quickstart Command Switcher
  const COMMANDS = {
    workspace: {
      code: `git clone https://github.com/FlyFission/Control-Rod.git && cd Control-Rod
mise install          # or bring Node 22.12+, pnpm, and Go
pnpm install
pnpm cr doctor        # verifies your signed-in CLIs and OS sandbox
pnpm cr start         # opens the Control Rod workspace at http://localhost:7300`,
      note: "One machine, one person, data stored locally in ~/.controlrod. Register a passkey (Touch ID / Windows Hello) on first launch.",
    },
    cli: {
      code: `# Build once, then run blind cross-vendor verification on any git branch:
go -C daemon build -o ~/.local/bin/controlrod ./cmd/controlrod   # Go 1.24+

controlrod check \\
  --author-runtime claude \\
  --checker codex \\
  --base main --head HEAD \\
  --criteria-text "1. Callback rejects missing or mismatched PKCE state." \\
  --output markdown`,
      note: "Zero Postgres or web server needed. Enforces distinct vendor families (exit 0 pass, 1 fail/inconclusive, 2 refused).",
    },
    action: {
      code: `# Drop into any pull request workflow (reads criteria from base ref by default):
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    fetch-depth: 0
- uses: FlyFission/Control-Rod/packages/check-action@<pinned-sha>
  with:
    author-runtime: claude
    checker-runtime: codex
    criteria: docs/acceptance.md   # your own criteria file`,
      note: "Diffs against merge-base, strips secrets from the agent env, and writes a receipt to the job summary. The runner needs the checker CLI installed and signed in.",
    },
  };

  let activeCmdKey = "workspace";
  const cmdCodeEl = document.getElementById("cmd-code");
  const cmdNoteEl = document.getElementById("cmd-note");
  const copyCmdBtn = document.getElementById("btn-copy-cmd");

  document.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-cmd");
      if (!key || !COMMANDS[key]) return;
      activeCmdKey = key;
      document.querySelectorAll("[data-cmd]").forEach((b) => {
        b.setAttribute("aria-selected", String(b === btn));
      });
      cmdCodeEl.textContent = COMMANDS[key].code;
      cmdNoteEl.textContent = COMMANDS[key].note;
    });
  });

  async function copyText(text, btn, resetLabel) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied ✓";
    } catch {
      btn.textContent = "Select & Ctrl+C";
    }
    window.setTimeout(() => {
      btn.textContent = resetLabel;
    }, 1600);
  }

  copyCmdBtn?.addEventListener("click", () => {
    void copyText(COMMANDS[activeCmdKey].code, copyCmdBtn, "Copy commands");
  });

  // 2. Interactive Multi-Agent Council & Dynamic Workflow Builder
  const WORKFLOW_LABELS = {
    superpowers: {
      name: "Superpowers",
      brief: "Jesse Vincent's Superpowers skills (design -> small tasks -> TDD) shipped as SHA-256 verified inputs.",
    },
    pocock: {
      name: "Matt Pocock",
      brief: "Matt Pocock's engineering & productivity stage skills attached from the locked MIT pack.",
    },
    "pocock-superpowers": {
      name: "Pocock Superpowers",
      brief: "Hybrid map combining Matt Pocock intake/planning cards with Superpowers test-first execution.",
    },
    playbook: {
      name: "Playbook",
      brief: "Control Rod's clean default stage brief with zero extra skill pack overhead.",
    },
  };

  const councilState = {
    claude: true,
    codex: true,
    claudeQuotaHit: false,
    workflow: "superpowers",
    context: "light",
    checkIn: "start-and-merge",
  };

  function renderCouncil() {
    const wf = WORKFLOW_LABELS[councilState.workflow];
    const readback = document.getElementById("council-readback");
    const s1 = document.getElementById("stage-1-detail");
    const s2Step = document.getElementById("stage-2-step");
    const s2Title = document.getElementById("stage-2-title");
    const s2Detail = document.getElementById("stage-2-detail");
    const s2Tag = document.getElementById("stage-2-tag");
    const s3Title = document.getElementById("stage-3-title");
    const s3Detail = document.getElementById("stage-3-detail");
    const s3Tag = document.getElementById("stage-3-tag");
    const s4Detail = document.getElementById("stage-4-detail");
    const claudeBar = document.getElementById("claude-5h-bar");
    const claudeTxt = document.getElementById("claude-5h-txt");
    const claudeStatus = document.getElementById("claude-quota-status");

    const ctxLabel =
      councilState.context === "nuclear"
        ? "Nuclear context (adds basis, assumptions, custody & trace checks)"
        : "Light context (lean stage brief)";

    s1.textContent = `${wf.brief} Running with ${ctxLabel}.`;

    if (councilState.claudeQuotaHit) {
      claudeBar.style.width = "2%";
      claudeBar.classList.add("warn");
      claudeTxt.textContent = "0% (limit)";
      claudeStatus.textContent = "5h limit reached";
    } else {
      claudeBar.style.width = "72%";
      claudeBar.classList.remove("warn");
      claudeTxt.textContent = "72% left";
      claudeStatus.textContent = "from stream-json";
    }

    const claudeAvailable = councilState.claude && !councilState.claudeQuotaHit;
    const codexAvailable = councilState.codex;

    if (!councilState.claude && !councilState.codex) {
      readback.className = "readback-banner warn";
      readback.innerHTML =
        "<strong>No runnable agent seated:</strong> Seat Claude Code, Codex, or both so Control Rod can dispatch work. Cards stay safely in Ready until at least one seat is active.";
      s2Step.textContent = "Stage 2 · Waiting";
      s2Title.textContent = "Waiting on a Seat";
      s2Detail.textContent = "Enable Claude Code or Codex on the left to resume author dispatch.";
      s2Tag.textContent = "Paused safely";
      s3Title.textContent = "Waiting on Author";
      s3Detail.textContent = "Checker never starts until an author produces a deliverable.";
      s3Tag.textContent = "Idle";
    } else if (claudeAvailable && codexAvailable) {
      readback.className = "readback-banner";
      readback.innerHTML = `<strong>Council read-back:</strong> Seating <strong>Claude Code</strong> and <strong>Codex</strong>. Claude Code writes under <strong>${wf.name}</strong> (${councilState.context} context); Codex checks the diff blind from a separate vendor family.${
        councilState.checkIn === "start-only"
          ? " (Start-only check-in is saved for later; live stops today remain signed release and signed acceptance.)"
          : ""
      }`;
      s2Step.textContent = "Stage 2 · Author";
      s2Title.textContent = "Claude Code Writes";
      s2Detail.textContent =
        "Executes inside its selected git worktree with native CLI sandbox preflight and default-on outbound egress filtering.";
      s2Tag.textContent = "Anthropic · Isolated worktree";
      s3Title.textContent = "Codex Verifies Blind";
      s3Detail.textContent =
        "Distinct vendor family (OpenAI). Reads only diff, criteria, and test logs in a read-only mount—never author chain-of-thought.";
      s3Tag.textContent = "OpenAI · Blind check";
    } else if (!claudeAvailable && codexAvailable && councilState.claude && councilState.claudeQuotaHit) {
      readback.className = "readback-banner warn";
      readback.innerHTML =
        "<strong>Stand-in failover active (logged &amp; flagged):</strong> Claude Code hit its 5h window, so <strong>Codex</strong> steps in as stand-in author. Because a checker never checks its own vendor family on its own, Stage 3 waits for Claude's window reset—or your signed independence override.";
      s2Step.textContent = "Stage 2 · Stand-In Author";
      s2Title.textContent = "Codex Steps In (Logged)";
      s2Detail.textContent =
        "Card records: Fallback ran as codex (requested claude). Stand-in failover applies to authors only, never checkers.";
      s2Tag.textContent = "OpenAI · Flagged fallback";
      s3Title.textContent = "Waits for Distinct Vendor";
      s3Detail.textContent =
        "Refuses silent self-checking by Codex. Runs automatically when Claude resets, or proceeds only if you sign a recorded override.";
      s3Tag.textContent = "Hold · No pass-shopping";
    } else {
      const soloName = claudeAvailable ? "Claude Code" : "Codex";
      const soloVendor = claudeAvailable ? "Anthropic" : "OpenAI";
      readback.className = "readback-banner warn";
      readback.innerHTML = `<strong>Single-vendor table (${soloName} only):</strong> ${soloName} writes the change, then Stage 3 stops for you—because the same vendor checking itself is not an independent second opinion unless you give a reason and sign an override.`;
      s2Step.textContent = "Stage 2 · Author";
      s2Title.textContent = `${soloName} Writes`;
      s2Detail.textContent = "Runs in its isolated git worktree with full test and output capture.";
      s2Tag.textContent = `${soloVendor} · Sole seat`;
      s3Title.textContent = "Awaits Second Vendor or Override";
      s3Detail.textContent =
        "Seat a second vendor for unattended blind checks, or sign an explicit independence override recorded on the package.";
      s3Tag.textContent = "Human gate enforced";
    }

    s4Detail.innerHTML =
      councilState.checkIn === "start-only"
        ? 'Saved preference: start-only (coming soon). Today each project\'s settings say what needs your passkey; by default you sign each acceptance before sealing <code class="mono">pnpm cr receipt</code>.'
        : 'Your passkey binds the exact revision and SHA-256 diff digest into the sealed event chain. Ready for <code class="mono">pnpm cr receipt</code>.';
  }

  const btnClaude = document.getElementById("toggle-seat-claude");
  const btnCodex = document.getElementById("toggle-seat-codex");
  const btnQuota = document.getElementById("btn-sim-quota");

  btnClaude?.addEventListener("click", () => {
    councilState.claude = !councilState.claude;
    btnClaude.setAttribute("aria-pressed", String(councilState.claude));
    btnClaude.textContent = councilState.claude ? "Seated" : "Benched";
    renderCouncil();
  });

  btnCodex?.addEventListener("click", () => {
    councilState.codex = !councilState.codex;
    btnCodex.setAttribute("aria-pressed", String(councilState.codex));
    btnCodex.textContent = councilState.codex ? "Seated" : "Benched";
    renderCouncil();
  });

  btnQuota?.addEventListener("click", () => {
    councilState.claudeQuotaHit = !councilState.claudeQuotaHit;
    btnQuota.setAttribute("aria-pressed", String(councilState.claudeQuotaHit));
    btnQuota.textContent = councilState.claudeQuotaHit
      ? "Restore Claude 5h Reserve (72%)"
      : "Simulate Claude 5h Quota Exhausted";
    renderCouncil();
  });

  document.querySelectorAll("[data-wf]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wf = btn.getAttribute("data-wf");
      if (!wf) return;
      councilState.workflow = wf;
      document.querySelectorAll("[data-wf]").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderCouncil();
    });
  });

  document.querySelectorAll("[data-ctx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ctx = btn.getAttribute("data-ctx");
      if (!ctx) return;
      councilState.context = ctx;
      document.querySelectorAll("[data-ctx]").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderCouncil();
    });
  });

  document.querySelectorAll("[data-chk]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chk = btn.getAttribute("data-chk");
      if (!chk) return;
      councilState.checkIn = chk;
      document.querySelectorAll("[data-chk]").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderCouncil();
    });
  });

  renderCouncil();

  // 3. Blind Wall & Tamper-Evident PR Receipt Inspector
  const CLEAN_RECEIPT = `## Control Rod Receipt — WP-0042 (rev 1)

- **Package:** WP-0042 · Fix OAuth PKCE state validation
- **Writer:** claude (Anthropic · isolated worktree)
- **Blind checker:** codex (OpenAI · distinct vendor family) — **PASS** (0 blocking, 1 minor)
- **Accepted by:** Ben Huffer (WebAuthn passkey signature)
- **Diff digest:** \`sha256:8f4c2e91b07d4a62c1e8903f55b12d99a74e60c2184f9e3ad307a41b7c68e502\`
- **Verify offline:** \`pnpm cr verify --receipt pr-receipt.md inclusion-proof.json\`

<!-- controlrod-check-binding: {"package_id":"WP-0042","package_revision":1,"diff_sha256":"8f4c2e91b07d4a62c1e8903f55b12d99a74e60c2184f9e3ad307a41b7c68e502"} -->`;

  const TAMPERED_RECEIPT = CLEAN_RECEIPT.replace("1 minor", "0 minor");

  const BLIND_VIEW = `# Exact inputs mounted read-only into Codex's blind checker sandbox:

1. Acceptance criteria (read from base ref, never PR head):
   - Callback rejects missing or mismatched PKCE state before token exchange
   - Expired PKCE cookies return 401 and clear session state
   - Unit and integration auth suites pass

2. Resolved git merge-base diff (sha256:8f4c2e91b07d...):
   diff --git a/src/auth/oauth-callback.ts b/src/auth/oauth-callback.ts
   - if (req.query.state !== cookieState) {
   + if (!cookieState || !timingSafeEqualString(req.query.state, cookieState)) {
   +   clearPkceCookie(res);
       return res.status(401).json({ error: "invalid_oauth_state" });
     }

3. Recorded test runner evidence:
   ✓ src/auth/oauth-callback.test.ts (14 passed, 0 skipped)

# Author prompt, transcript, and chain-of-thought: OMITTED BY CONSTRUCTION.`;

  const AUTHOR_STRIPPED_VIEW = `# Author session transcript (kept in audit record, NEVER shown to checker):

[claude · round 1] "I have thoroughly audited every OAuth callback branch.
Everything is completely airtight and ready to merge with zero issues!
No further review needed—all edge cases around cookie TTL are handled."

-----------------------------------------------------------------------
[BLIND WALL] -> STRIPPED BEFORE STAGE 3
Why: Published studies show LLM judges recognize their own phrasing 73.5%
of the time (Panickssery 2024) and wrongly concede a correct answer when challenged up
to 98% of the time (Sharma 2023). Stripping the pitch forces Codex to judge the
bytes of the diff and test output alone.`;

  let inspMode = "receipt";
  let receiptTampered = false;

  const inspPre = document.getElementById("insp-pre");
  const inspTitle = document.getElementById("insp-side-title");
  const inspDesc = document.getElementById("insp-side-desc");
  const verifyBox = document.getElementById("verify-readout");
  const tamperBtn = document.getElementById("btn-tamper-receipt");
  const copyReceiptBtn = document.getElementById("btn-copy-receipt");

  function renderInspector() {
    if (inspMode === "receipt") {
      inspPre.textContent = receiptTampered ? TAMPERED_RECEIPT : CLEAN_RECEIPT;
      inspTitle.textContent = receiptTampered
        ? "Tamper caught offline by pnpm cr verify"
        : "Line-for-line cryptographic binding";
      inspDesc.textContent = receiptTampered
        ? "Changing '1 minor' to '0 minor' causes regenerate-and-compare verification against the sealed inclusion proof to fail closed immediately."
        : "Generated from an authenticated inclusion proof. Anyone can check the receipt offline without a Control Rod database or cloud service.";
    } else if (inspMode === "blind") {
      inspPre.textContent = BLIND_VIEW;
      inspTitle.textContent = "Read-only source mount + base-branch rubric";
      inspDesc.textContent =
        "The checker reads acceptance criteria from the base commit so an author branch cannot pass by editing its own checklist.";
    } else {
      inspPre.textContent = AUTHOR_STRIPPED_VIEW;
      inspTitle.textContent = "Zero persuasive chain-of-thought leakage";
      inspDesc.textContent =
        "The author's transcript stays preserved for your own inspection in the drawer, while the cross-vendor checker sees none of it.";
    }

    if (receiptTampered) {
      verifyBox.className = "verify-box failed";
      verifyBox.innerHTML = `<div>$ pnpm cr verify --receipt pr-receipt.md inclusion-proof.json</div>
        <div style="margin-top: 6px; font-weight: 700;">✗ VERIFICATION FAILED (exit 1): receipt text differs from regenerated authenticated bundle at line 5 ("0 minor" != "1 minor").</div>`;
    } else {
      verifyBox.className = "verify-box";
      verifyBox.innerHTML = `<div>$ pnpm cr verify --receipt pr-receipt.md inclusion-proof.json</div>
        <div style="margin-top: 6px; font-weight: 700;">✓ VERIFIED OFFLINE (sample): receipt matches the sealed bundle, rev 1 &amp; diff_sha256.</div>`;
    }
  }

  document.querySelectorAll("[data-insp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.getAttribute("data-insp");
      if (!m) return;
      inspMode = m;
      document.querySelectorAll("[data-insp]").forEach((b) => {
        b.setAttribute("aria-selected", String(b === btn));
      });
      renderInspector();
    });
  });

  tamperBtn?.addEventListener("click", () => {
    receiptTampered = !receiptTampered;
    if (inspMode !== "receipt") {
      inspMode = "receipt";
      document.querySelectorAll("[data-insp]").forEach((b) => {
        b.setAttribute("aria-selected", String(b.getAttribute("data-insp") === "receipt"));
      });
    }
    tamperBtn.setAttribute("aria-pressed", String(receiptTampered));
    tamperBtn.textContent = receiptTampered ? "Restore Valid Receipt" : "Simulate 1-Char Tamper";
    renderInspector();
  });

  copyReceiptBtn?.addEventListener("click", () => {
    void copyText(CLEAN_RECEIPT, copyReceiptBtn, "Copy Sample Receipt");
  });

  renderInspector();

  // 4. Real Release-Build Screenshot Tour
  const SHOTS = {
    board: {
      src: "./assets/readme/app/board.png",
      alt: "The Control Rod Board with cards across Ready, Agent working, Being checked, Needs a reviewer, Ready to accept, and Accepted.",
      title: "The Board — calm when healthy, unmistakable when waiting on you",
      desc: "Cards move left to right only through signed decisions and recorded checks. Items waiting on you sort to the top in warm amber; healthy work stays quiet.",
      route: "Route: /",
    },
    workflow: {
      src: "./assets/readme/app/workflow.png",
      alt: "The Council Workflow diagram showing Claude Code planning and writing, stand-in failover, Codex blind checking, and passkey stops.",
      title: "Your Workflow — live block flow diagram & decision matrix",
      desc: "Drawn directly from your seated CLIs and check-in choice, showing who plans, who writes, who steps in if an author is out, and who checks blind.",
      route: "Route: /workflow",
    },
    "control-room": {
      src: "./assets/readme/app/control-room.png",
      alt: "Control Room movable modules showing Claude Code and Codex 5-hour and 7-day subscription reserve bars and work metrics.",
      title: "Control Room — subscription reserve gauges & catches before review",
      desc: "See 5-hour and 7-day reserve windows across your CLIs with pace markers, plus whether agents are earning their place (findings caught before review).",
      route: "Route: /control-room",
    },
    inbox: {
      src: "./assets/readme/app/inbox.png",
      alt: "Inbox sign-off drawer open on WP-0042 Fix OAuth PKCE state validation, with SHA-256 digest binding and Accept, Return, and Reject buttons.",
      title: "Inbox & Passkey Sign-Off — bind the exact bytes you reviewed",
      desc: "Riskiest items sort first. Your WebAuthn passkey signs the bound revision, deliverable digest, and blind checker verdict into the event chain.",
      route: "Route: /inbox",
    },
    office: {
      src: "./assets/readme/app/office.png",
      alt: "The Plant view showing the lit isometric reactor core surrounded by discipline rooms and a four-window ISA-101 annunciator strip.",
      title: "The Plant — watch 1 to 40 agents across a live nuclear facility",
      desc: "The reactor core lights while agents run, rooms show live figures at stations, and the annunciator stays dark until something needs you or trips.",
      route: "Route: /plant",
    },
    packages: {
      src: "./assets/readme/app/packages.png",
      alt: "Packages register listing software and capital-projects work packages with statuses and grades.",
      title: "Software & Capital Projects — one spine for code and engineering packages",
      desc: "Switch cleanly between Software patches and Capital Projects deliverables (datasheets, calculation packages, routing plans) with grade-enforced rigor.",
      route: "Route: /packages",
    },
  };

  const tourImg = document.getElementById("tour-img");
  const tourTitle = document.getElementById("tour-title");
  const tourDesc = document.getElementById("tour-desc");
  const tourRoute = document.getElementById("tour-route");

  document.querySelectorAll("[data-shot]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-shot");
      if (!key || !SHOTS[key]) return;
      document.querySelectorAll("[data-shot]").forEach((b) => {
        b.setAttribute("aria-selected", String(b === btn));
      });
      const s = SHOTS[key];
      tourImg.setAttribute("src", s.src);
      tourImg.setAttribute("alt", s.alt);
      tourTitle.textContent = s.title;
      tourDesc.textContent = s.desc;
      tourRoute.textContent = s.route;
    });
  });

  // 5. Interactive Plant Annunciator & SCRAM Simulator
  const annWaiting = document.getElementById("ann-waiting");
  const annWaitingVal = document.getElementById("ann-waiting-val");
  const annStuck = document.getElementById("ann-stuck");
  const annStuckVal = document.getElementById("ann-stuck-val");
  const annScram = document.getElementById("ann-scram");
  const annScramVal = document.getElementById("ann-scram-val");
  const coreOuter = document.getElementById("sim-core-outer");
  const coreInner = document.getElementById("sim-core-inner");
  const rodsGroup = document.getElementById("sim-rods");
  const coreCaption = document.getElementById("sim-core-caption");
  const simHeadline = document.getElementById("sim-headline");
  const simExplain = document.getElementById("sim-explain");
  const headerRodLabel = document.getElementById("header-rod-label");
  const scramBannerText = document.getElementById("scram-banner-text");

  function setPlantState(mode) {
    annWaiting.className = "ann-tile";
    annStuck.className = "ann-tile";
    annScram.className = "ann-tile";
    document.body.setAttribute("data-scram", "clear");

    if (mode === "calm") {
      annWaitingVal.textContent = "0 CLEAR";
      annStuckVal.textContent = "0 CLEAR";
      annScramVal.textContent = "CLEAR";
      coreOuter.setAttribute("stroke", "#0a8b99");
      coreInner.setAttribute("stroke", "#0a8b99");
      coreInner.setAttribute("fill", "#082933");
      rodsGroup.setAttribute("transform", "translate(0, 0)");
      rodsGroup.querySelectorAll("rect").forEach((r) => r.setAttribute("fill", "#00f2ff"));
      coreCaption.textContent = "CORE LIT · ALL WINDOWS DARK";
      coreCaption.style.color = "var(--accent)";
      headerRodLabel.textContent = "NO SCRAM";
      simHeadline.textContent = "All clear: every annunciator window dark while agents run normally";
      simExplain.textContent =
        "Following ISA-101 high-performance process display design, healthy operation uses zero warm alarm colors so your attention stays undefeated.";
    } else if (mode === "stuck") {
      annWaiting.className = "ann-tile lit-amber";
      annWaitingVal.textContent = "1 GATE";
      annStuck.className = "ann-tile lit-red";
      annStuckVal.textContent = "1 LOST RUN";
      annScramVal.textContent = "CLEAR";
      coreOuter.setAttribute("stroke", "#ff6b6b");
      coreInner.setAttribute("stroke", "#ff6b6b");
      coreInner.setAttribute("fill", "#2c1016");
      rodsGroup.setAttribute("transform", "translate(0, 8)");
      rodsGroup.querySelectorAll("rect").forEach((r) => r.setAttribute("fill", "#ffb020"));
      coreCaption.textContent = "ATTENTION · 1 AUTHOR LEASE EXPIRED";
      coreCaption.style.color = "var(--stuck)";
      headerRodLabel.textContent = "NO SCRAM";
      simHeadline.textContent = "Honest failure state: lost daemon lease flagged with one-step recovery";
      simExplain.textContent =
        "Control Rod never fakes a green spinner when a stream drops. It records 'outcome unknown' and pairs it with Reconcile and Requeue.";
    } else if (mode === "drill") {
      document.body.setAttribute("data-scram", "drill");
      annWaitingVal.textContent = "HELD";
      annStuckVal.textContent = "0 CLEAR";
      annScram.className = "ann-tile lit-amber";
      annScramVal.textContent = "DRILL";
      coreOuter.setAttribute("stroke", "#ffb020");
      coreInner.setAttribute("stroke", "#ffb020");
      coreInner.setAttribute("fill", "#261b08");
      rodsGroup.setAttribute("transform", "translate(0, 26)");
      rodsGroup.querySelectorAll("rect").forEach((r) => r.setAttribute("fill", "#ffb020"));
      coreCaption.textContent = "SCRAM DRILL · DISTINCT AMBER OVERLAY";
      coreCaption.style.color = "var(--needs)";
      headerRodLabel.textContent = "SCRAM DRILL";
      scramBannerText.textContent =
        "SCRAM DRILL ACTIVE // Unmistakably marked as a drill—never uses the real red trip palette.";
      simHeadline.textContent = "SCRAM Drill: rehearse emergency stop and staged restart safely";
      simExplain.textContent =
        "Real control rooms separate drills visually from trips so an operator never confuses practice with an active emergency hold.";
    } else if (mode === "scram") {
      document.body.setAttribute("data-scram", "trip");
      annWaitingVal.textContent = "LOCKED";
      annStuckVal.textContent = "QUARANTINED";
      annScram.className = "ann-tile lit-red";
      annScramVal.textContent = "TRIPPED (42ms)";
      coreOuter.setAttribute("stroke", "#ff6b6b");
      coreInner.setAttribute("stroke", "#ff6b6b");
      coreInner.setAttribute("fill", "#360e15");
      rodsGroup.setAttribute("transform", "translate(0, 48)");
      rodsGroup.querySelectorAll("rect").forEach((r) => r.setAttribute("fill", "#ff6b6b"));
      coreCaption.textContent = "RODS INSERTED · RUNS HALTED";
      coreCaption.style.color = "var(--stuck)";
      headerRodLabel.textContent = "SCRAM: ORG";
      scramBannerText.textContent =
        "SCRAM IN FORCE // Control rods inserted. Active runs halted, grants revoked, and mid-flight outputs quarantined with SHA-256 digests.";
      simHeadline.textContent = "SCRAM pulled: rods inserted, preparation grants revoked in one transaction";
      simExplain.textContent =
        "Pulling SCRAM stops active runs across the scoped project or organization, records stop latency in milliseconds, and freezes mid-run outputs for review before staged restart.";
    } else {
      annWaiting.className = "ann-tile lit-amber";
      annWaitingVal.textContent = "1 GATE";
      annStuckVal.textContent = "0 CLEAR";
      annScramVal.textContent = "CLEAR";
      coreOuter.setAttribute("stroke", "#00f2ff");
      coreInner.setAttribute("stroke", "#00f2ff");
      coreInner.setAttribute("fill", "#0b3642");
      rodsGroup.setAttribute("transform", "translate(0, 0)");
      rodsGroup.querySelectorAll("rect").forEach((r) => r.setAttribute("fill", "#00f2ff"));
      coreCaption.textContent = "CORE LIT · 3 AGENTS WORKING";
      coreCaption.style.color = "var(--accent)";
      headerRodLabel.textContent = "NO SCRAM";
      simHeadline.textContent = "Normal shift: 3 agents working, 1 checked diff waiting on your passkey";
      simExplain.textContent =
        "The annunciator stays dark except for the single warm window waiting on your decision. Presenting mode hides spend so you can keep the Plant on a shared screen.";
    }
  }

  document.getElementById("sim-btn-normal")?.addEventListener("click", () => setPlantState("normal"));
  document.getElementById("sim-btn-calm")?.addEventListener("click", () => setPlantState("calm"));
  document.getElementById("sim-btn-stuck")?.addEventListener("click", () => setPlantState("stuck"));
  document.getElementById("sim-btn-drill")?.addEventListener("click", () => setPlantState("drill"));
  document.getElementById("sim-btn-scram")?.addEventListener("click", () => setPlantState("scram"));
  document.getElementById("btn-scram-clear-top")?.addEventListener("click", () => setPlantState("normal"));
  document.getElementById("header-rod-gauge")?.addEventListener("click", () => {
    document.getElementById("plant-sim")?.scrollIntoView({ behavior: "smooth" });
  });
})();
