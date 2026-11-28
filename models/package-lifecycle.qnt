// A model of the work package lifecycle, as the kernel decides it
// (kernel/src/transition.rs). Pattern PL1 in docs/patterns/plannotator.md.
//
// The model keeps what the server keeps between requests: the status, which
// agent holds the claim, who authored the current output and on which
// provider, the latest pre-check outcome and whether the owner's independence
// override is on record. Each
// step builds the request the server would send to the kernel from that
// state plus choices that vary per request (actor, signature, reason,
// checker, preparation facts), computes the decision the floors require, and
// records both. Generated traces (models/README.md) replay those
// request/decision pairs against the real kernel.
//
// An empty string stands for an absent optional field.
//
// This is a model checked by random simulation, not a proof.
module package_lifecycle {
  type Prep = {
    requirements_confirmed: bool,
    ready_for_release: bool,
    basis_current: bool,
    manifest_matches: bool,
    results_complete: bool,
    required_checks_complete: bool,
    results_pass: bool,
  }

  // What varies per request; the rest of the request comes from the state.
  type Ask = {
    act: str,
    actor_kind: str,
    actor_id: str,
    checker_baseline: str,
    checker_provider: str,
    with_families: bool,
    assertion_verified: bool,
    digest_matches: bool,
    reason_given: bool,
    prep_enrolled: bool,
    prep: Prep,
  }

  // The kernel request (transition::Request), with runtimes reduced to providers.
  // `act` is the kernel's `action` (a reserved word in Quint). `families` is the
  // vendor-family table the server passes with a pre-check (empty otherwise).
  type Request = {
    status: str,
    act: str,
    actor_kind: str,
    actor_id: str,
    claimed_by: str,
    author_baseline: str,
    checker_baseline: str,
    author_provider: str,
    checker_provider: str,
    families: str -> str,
    owner_override_verified: bool,
    pre_check: str,
    assertion_verified: bool,
    digest_matches: bool,
    reason_given: bool,
    prep_enrolled: bool,
    prep: Prep,
  }

  type Outcome = { allowed: bool, reason: str, next: str }

  pure val ACTIONS = Set(
    "release", "claim", "submit-output", "submit-pre-check", "revise", "accept",
    "accept-with-findings", "return", "reject", "override-independence",
  )
  // Floor 1: only a person may do these, and only signed over what they reviewed.
  pure val HUMAN_ONLY = Set("release", "accept", "accept-with-findings", "return", "reject", "override-independence")
  pure val AGENT_WORK = Set("claim", "submit-output", "submit-pre-check", "revise")
  pure val ACTOR_KINDS = Set("human", "agent", "system")
  // Agents act under their baseline, as the server sends them; agent-7 holds no claim.
  pure val BASELINES = Set("b1", "b2")
  pure val ACTOR_IDS = Set("", "ben", "agent-7").union(BASELINES)
  // Provider spellings the server may report. The kernel trims them and ignores ASCII case.
  // anthropic-api shares claude's family; opencode has no family in the table.
  pure val PROVIDERS = Set("claude", " Claude", "codex", "CODEX ", "anthropic-api", "opencode")
  pure val CANON = Map(
    "claude" -> "claude", " Claude" -> "claude", "codex" -> "codex", "CODEX " -> "codex",
    "anthropic-api" -> "anthropic-api", "opencode" -> "opencode",
  )
  // The vendor-family table (daemon/internal/runner/models.json in the product), reduced to
  // the providers above.
  pure val FAMILIES = Map("claude" -> "Anthropic", "codex" -> "OpenAI", "anthropic-api" -> "Anthropic")
  pure val NO_FAMILIES: str -> str = Map()
  pure val PRE_CHECKS = Set("pass", "fail", "inconclusive")
  pure val ALL_TRUE: Prep = {
    requirements_confirmed: true, ready_for_release: true, basis_current: true,
    manifest_matches: true, results_complete: true, required_checks_complete: true,
    results_pass: true,
  }

  // The server's record of the package.
  var status: str
  var claimedBy: str
  var authorBaseline: str
  var authorProvider: str
  var preCheck: str
  var overrideVerified: bool
  // The last request and the decision the floors require, for traces and invariants.
  var lastReq: Request
  var lastOut: Outcome
  // Ghost: the terminal status once reached ("" before).
  var terminal: str

  pure def refuse(reason: str): Outcome = { allowed: false, reason: reason, next: "" }
  pure def allowTo(target: str): Outcome = { allowed: true, reason: "allowed", next: target }

  // The family the table names for a provider, or "" when it names none.
  pure def familyOf(p: str, fam: str -> str): str =
    if (CANON.keys().contains(p) and fam.keys().contains(CANON.get(p))) fam.get(CANON.get(p)) else ""

  // Two runtimes may be the same: one provider, one family, or a provider of unknown family.
  pure def sameRuntime(a: str, b: str, fam: str -> str): bool =
    CANON.get(a) == CANON.get(b) or familyOf(a, fam) == "" or familyOf(b, fam) == ""
      or familyOf(a, fam) == familyOf(b, fam)

  // The actor holds the package's claim.
  pure def holdsClaim(r: Request): bool = r.claimed_by != "" and r.claimed_by == r.actor_id

  // Floors for an enrolled package: facts the server derives from its preparation records.
  pure def prepAllows(r: Request): bool =
    if (not(r.prep_enrolled)) true
    else if (r.act == "release")
      r.prep.requirements_confirmed and r.prep.ready_for_release and r.prep.basis_current and r.prep.manifest_matches
    else if (AGENT_WORK.contains(r.act))
      r.prep.requirements_confirmed and r.prep.basis_current and r.prep.manifest_matches
    else if (r.act == "accept" or r.act == "accept-with-findings")
      r.prep.requirements_confirmed and r.prep.basis_current and r.prep.manifest_matches
        and r.prep.results_complete and r.prep.required_checks_complete
        and (r.act == "accept-with-findings" or r.prep.results_pass)
    else true

  // Floor 3: the pre-check comes from the checker it names, another baseline and another
  // vendor family, unless the owner overrode.
  pure def preCheckDecision(r: Request): Outcome =
    if (r.checker_baseline != r.actor_id) refuse("forbidden")
    else if (r.author_baseline != "" and r.checker_baseline != "" and r.author_baseline == r.checker_baseline)
      refuse("not-independent")
    else if (r.author_baseline != "" and r.checker_baseline != "" and r.author_provider != "" and r.checker_provider != "")
      if (sameRuntime(r.author_provider, r.checker_provider, r.families) and not(r.owner_override_verified)) refuse("not-independent")
      else allowTo("in-verification")
    else refuse("forbidden")

  // Which moves each status allows. Anything not named is the wrong state.
  pure def table(r: Request): Outcome =
    val a = r.act
    val s = r.status
    if (a == "release" and s == "draft") allowTo("released")
    else if (a == "claim" and s == "released") allowTo("in-work")
    // Floor 2: only the claim holder submits output or revises.
    else if (a == "submit-output" and s == "in-work")
      if (holdsClaim(r)) allowTo("in-verification") else refuse("forbidden")
    else if (a == "submit-pre-check" and s == "in-verification") preCheckDecision(r)
    // Floor 4: revise only after a pre-check that did not pass.
    else if (a == "revise" and s == "in-verification")
      if (not(holdsClaim(r))) refuse("forbidden")
      else if (r.pre_check == "") refuse("missing-pre-check")
      else if (r.pre_check == "pass") refuse("wrong-state")
      else allowTo("in-work")
    // Floor 5: acceptance needs a pre-check; one that did not pass needs a written reason.
    else if (a == "accept" and s == "in-verification")
      if (r.pre_check == "") refuse("missing-pre-check")
      else if (r.pre_check == "pass") allowTo("accepted")
      else refuse("reason-required")
    else if (a == "accept-with-findings" and s == "in-verification")
      if (r.pre_check == "") refuse("missing-pre-check")
      else if (r.reason_given) allowTo("accepted")
      else refuse("reason-required")
    else if (a == "override-independence" and s == "in-verification")
      if (r.reason_given) allowTo("in-verification") else refuse("reason-required")
    else if (a == "return" and Set("released", "in-work", "in-verification").contains(s))
      if (r.reason_given) allowTo("draft") else refuse("reason-required")
    else if (a == "reject" and Set("draft", "released", "in-work", "in-verification").contains(s))
      if (r.reason_given) allowTo("closed") else refuse("reason-required")
    else refuse("wrong-state")

  // The decision the floors require, in the kernel's order of checks.
  pure def expected(r: Request): Outcome =
    if (r.actor_id == "") refuse("forbidden")
    else if (HUMAN_ONLY.contains(r.act) and r.actor_kind != "human") refuse("not-human")
    else if (HUMAN_ONLY.contains(r.act) and not(r.assertion_verified and r.digest_matches)) refuse("unsigned")
    // Floor 2: claims and submissions come from agents, never from a person's session.
    else if (not(HUMAN_ONLY.contains(r.act)) and r.actor_kind != "agent") refuse("forbidden")
    else if (not(prepAllows(r))) refuse("forbidden")
    else table(r)

  def requestFor(k: Ask): Request = {
    status: status,
    act: k.act,
    actor_kind: k.actor_kind,
    actor_id: k.actor_id,
    claimed_by: claimedBy,
    author_baseline: authorBaseline,
    checker_baseline: k.checker_baseline,
    author_provider: authorProvider,
    checker_provider: k.checker_provider,
    families: if (k.act == "submit-pre-check" and k.with_families) FAMILIES else NO_FAMILIES,
    owner_override_verified: overrideVerified,
    pre_check: preCheck,
    assertion_verified: k.assertion_verified,
    digest_matches: k.digest_matches,
    reason_given: k.reason_given,
    prep_enrolled: k.prep_enrolled,
    prep: k.prep,
  }

  pure val EMPTY_PREP: Prep = {
    requirements_confirmed: false, ready_for_release: false, basis_current: false,
    manifest_matches: false, results_complete: false, required_checks_complete: false,
    results_pass: false,
  }
  pure val NO_REQUEST: Request = {
    status: "", act: "", actor_kind: "", actor_id: "", claimed_by: "", author_baseline: "",
    checker_baseline: "", author_provider: "", checker_provider: "", families: NO_FAMILIES,
    owner_override_verified: false, pre_check: "", assertion_verified: false,
    digest_matches: false, reason_given: false, prep_enrolled: false, prep: EMPTY_PREP,
  }

  action init = all {
    status' = "draft",
    claimedBy' = "",
    authorBaseline' = "",
    authorProvider' = "",
    preCheck' = "",
    overrideVerified' = false,
    lastReq' = NO_REQUEST,
    lastOut' = refuse(""),
    terminal' = "",
  }

  // One request. pc is the pre-check outcome if a pre-check is allowed; p is the author's
  // provider if output is submitted. The author's baseline is the agent that submitted it.
  action apply(k: Ask, pc: str, p: str): bool = {
    val r = requestFor(k)
    val out = expected(r)
    val n = if (out.allowed) out.next else status
    all {
      lastReq' = r,
      lastOut' = out,
      status' = n,
      claimedBy' =
        if (out.allowed and k.act == "claim") k.actor_id
        else if (out.allowed and k.act == "return") ""
        else claimedBy,
      authorBaseline' =
        if (out.allowed and k.act == "submit-output") k.actor_id
        else if (out.allowed and k.act == "return") ""
        else authorBaseline,
      authorProvider' =
        if (out.allowed and k.act == "submit-output") p
        else if (out.allowed and k.act == "return") ""
        else authorProvider,
      preCheck' =
        if (out.allowed and k.act == "submit-pre-check") pc
        else if (out.allowed and Set("revise", "return").contains(k.act)) ""
        else preCheck,
      overrideVerified' =
        if (out.allowed and k.act == "override-independence") true
        else if (out.allowed and Set("revise", "return").contains(k.act)) false
        else overrideVerified,
      terminal' = if (terminal == "" and Set("accepted", "closed").contains(n)) n else terminal,
    }
  }

  // Moves that name the current status, so guided steps make progress. Return and reject
  // elsewhere, and every other action, come from free steps.
  pure def movesFor(s: str, pc: str): Set[str] =
    if (s == "draft") Set("release")
    else if (s == "released") Set("claim")
    else if (s == "in-work") Set("submit-output")
    else if (s == "in-verification" and pc == "")
      // Before a pre-check: mostly get one, sometimes try to accept or revise without one.
      Set("submit-pre-check", "override-independence", "accept", "revise")
    else if (s == "in-verification")
      Set("accept", "accept-with-findings", "revise", "submit-pre-check", "return")
    else ACTIONS

  // Steps are guided or free. A guided step is a well-formed request, signed when a person
  // acts, for a move the status names. The claim holder submits and revises; the checker is
  // another baseline than the author's and submits its own pre-check, with the family table.
  // One step in sixteen closes instead (return or reject). One in four is free: any action,
  // actor, checker and facts.
  action step = {
    nondet mode = oneOf(1.to(16))
    val guided = mode > 4
    val closing = mode == 16
    nondet freeAct = oneOf(ACTIONS)
    nondet guidedAct = oneOf(movesFor(status, preCheck))
    nondet closingAct = oneOf(Set("return", "reject"))
    val act = if (closing) closingAct else if (guided) guidedAct else freeAct
    nondet freeKind = oneOf(ACTOR_KINDS)
    val actorKind = if (not(guided)) freeKind else if (HUMAN_ONLY.contains(act)) "human" else "agent"
    nondet freeId = oneOf(ACTOR_IDS)
    nondet claimant = oneOf(BASELINES)
    nondet freeChecker = oneOf(BASELINES.union(Set("")))
    val checkerBaseline = if (guided) (if (authorBaseline == "b1") "b2" else "b1") else freeChecker
    val guidedId =
      if (actorKind == "human") "ben"
      else if (act == "claim") claimant
      else if (act == "submit-pre-check") checkerBaseline
      else if (claimedBy != "") claimedBy
      else "agent-7"
    val actorId = if (guided) guidedId else freeId
    nondet checkerProvider = oneOf(PROVIDERS.union(Set("")))
    nondet freeFamilies = oneOf(Set(true, false))
    val withFamilies = guided or freeFamilies
    nondet freeAssertion = oneOf(Set(true, false))
    nondet freeDigest = oneOf(Set(true, false))
    val assertion = guided or freeAssertion
    val digest = guided or freeDigest
    nondet reason = oneOf(Set(true, false))
    nondet enrolled = oneOf(Set(true, false))
    nondet freeReady = oneOf(Set(true, false))
    val prepReady = guided or freeReady
    nondet rc = oneOf(Set(true, false))
    nondet rr = oneOf(Set(true, false))
    nondet bc = oneOf(Set(true, false))
    nondet mm = oneOf(Set(true, false))
    nondet rcomp = oneOf(Set(true, false))
    nondet rchk = oneOf(Set(true, false))
    nondet rp = oneOf(Set(true, false))
    nondet pc = oneOf(PRE_CHECKS)
    nondet p = oneOf(PROVIDERS)
    val prep: Prep = if (prepReady) ALL_TRUE else {
      requirements_confirmed: rc, ready_for_release: rr, basis_current: bc,
      manifest_matches: mm, results_complete: rcomp, required_checks_complete: rchk,
      results_pass: rp,
    }
    apply({
      act: act, actor_kind: actorKind, actor_id: actorId,
      checker_baseline: checkerBaseline, checker_provider: checkerProvider,
      with_families: withFamilies,
      assertion_verified: assertion, digest_matches: digest, reason_given: reason,
      prep_enrolled: enrolled, prep: prep,
    }, pc, p)
  }

  // ---------------------------------------------------------------------------
  // Invariants: the floors in plain words, checked in every state.
  // ---------------------------------------------------------------------------

  def allowed(a: str): bool = lastOut.allowed and lastReq.act == a

  // Floor 1: every allowed human act came from a person, signed over the reviewed digest.
  val HumanActsSigned =
    (lastOut.allowed and HUMAN_ONLY.contains(lastReq.act)) implies
      (lastReq.actor_kind == "human" and lastReq.assertion_verified and lastReq.digest_matches)

  // Floor 2: every allowed claim, submission or revision came from an agent.
  val AgentWorkByAgents =
    (lastOut.allowed and AGENT_WORK.contains(lastReq.act)) implies lastReq.actor_kind == "agent"

  // Floor 2: only the agent that holds the claim submits output or revises.
  val WorkByClaimHolder =
    (allowed("submit-output") or allowed("revise")) implies holdsClaim(lastReq)

  // Floor 2: a pre-check is submitted by the checker the request names.
  val PreCheckByItsChecker =
    allowed("submit-pre-check") implies lastReq.actor_id == lastReq.checker_baseline

  // Floor 3: an allowed pre-check came from another baseline, and from another known vendor
  // family unless the owner's override is on record.
  val PreCheckIndependent =
    allowed("submit-pre-check") implies (
      lastReq.checker_baseline != lastReq.author_baseline
        and (not(sameRuntime(lastReq.checker_provider, lastReq.author_provider, lastReq.families))
          or lastReq.owner_override_verified)
    )

  // Floor 4: a revision follows a pre-check that did not pass.
  val ReviseAfterNonPass =
    allowed("revise") implies Set("fail", "inconclusive").contains(lastReq.pre_check)

  // Floor 5: acceptance has a pre-check; without a pass it carries a written reason.
  val AcceptanceHasPreCheck =
    (allowed("accept") or allowed("accept-with-findings")) implies (
      lastReq.pre_check != ""
        and (lastReq.pre_check == "pass" or (lastReq.act == "accept-with-findings" and lastReq.reason_given))
    )

  // An enrolled release needs confirmed requirements, readiness, a current basis and a matching manifest.
  val EnrolledReleaseReady =
    (allowed("release") and lastReq.prep_enrolled) implies (
      lastReq.prep.requirements_confirmed and lastReq.prep.ready_for_release
        and lastReq.prep.basis_current and lastReq.prep.manifest_matches
    )

  // Accepted and closed are final: once reached, the status never changes.
  val TerminalIsFinal = terminal != "" implies status == terminal

  // An allowed request always moves to a named status; a refused one never does.
  val OutcomeShape = (lastOut.allowed iff lastOut.next != "") and (lastOut.allowed iff lastOut.reason == "allowed")

  val Floors = HumanActsSigned and AgentWorkByAgents and WorkByClaimHolder and PreCheckByItsChecker
    and PreCheckIndependent and ReviseAfterNonPass
    and AcceptanceHasPreCheck and EnrolledReleaseReady and TerminalIsFinal and OutcomeShape

  // Witnesses: states a useful set of traces should reach (reported with --witnesses).
  val ReachedAccepted = status == "accepted"
  val ReachedClosed = status == "closed"
  val RefusedNotIndependent = lastOut.reason == "not-independent"
  val PreCheckAllowedAfterOverride = allowed("submit-pre-check") and lastReq.owner_override_verified
  val RevisedAfterFail = allowed("revise")
  val RefusedOutsideClaim =
    Set("submit-output", "revise").contains(lastReq.act) and lastReq.status != "" and lastOut.reason == "forbidden"
      and lastReq.actor_kind == "agent" and not(holdsClaim(lastReq))
  val RefusedSameFamily =
    lastOut.reason == "not-independent" and lastReq.checker_baseline != lastReq.author_baseline
      and CANON.get(lastReq.checker_provider) != CANON.get(lastReq.author_provider)

  // ---------------------------------------------------------------------------
  // Scripted runs: named paths through the lifecycle.
  // ---------------------------------------------------------------------------

  pure def ask(a: str, kind: str): Ask = {
    act: a, actor_kind: kind, actor_id: if (kind == "human") "ben" else "b1",
    checker_baseline: "", checker_provider: "", with_families: true, assertion_verified: true,
    digest_matches: true, reason_given: false, prep_enrolled: false, prep: EMPTY_PREP,
  }
  pure def checker(b: str, p: str): Ask =
    { ...ask("submit-pre-check", "agent"), actor_id: b, checker_baseline: b, checker_provider: p }
  pure def withReason(k: Ask): Ask = { ...k, reason_given: true }
  pure def by(k: Ask, id: str): Ask = { ...k, actor_id: id }

  // Release, claim and submit as b1 on claude: in verification with no pre-check.
  action toVerification =
    init
      .then(apply(ask("release", "human"), "", ""))
      .then(apply(ask("claim", "agent"), "", ""))
      .then(apply(ask("submit-output", "agent"), "", "claude"))

  run sameProviderPreCheckNeedsOverrideTest =
    toVerification
      .then(apply(checker("b2", " Claude"), "pass", ""))
      .then(all { assert(lastOut == refuse("not-independent")), apply(withReason(ask("override-independence", "human")), "", "") })
      .then(all { assert(lastOut.allowed), apply(checker("b2", " Claude"), "pass", "") })
      .then(all { assert(lastOut == allowTo("in-verification")), apply(ask("accept", "human"), "", "") })
      .then(all { assert(status == "accepted"), apply(withReason(ask("return", "human")), "", "") })
      .then(all { assert(lastOut == refuse("wrong-state")), assert(status == "accepted"), init })

  run sameFamilyOrUnknownFamilyNeedsOverrideTest =
    toVerification
      .then(apply(checker("b2", "anthropic-api"), "pass", ""))
      .then(all { assert(lastOut == refuse("not-independent")), apply(checker("b2", "opencode"), "pass", "") })
      .then(all { assert(lastOut == refuse("not-independent")), apply({ ...checker("b2", "codex"), with_families: false }, "pass", "") })
      .then(all { assert(lastOut == refuse("not-independent")), apply(checker("b2", "CODEX "), "pass", "") })
      .then(all { assert(lastOut == allowTo("in-verification")), init })

  run onlyTheClaimHolderSubmitsTest =
    init
      .then(apply(ask("release", "human"), "", ""))
      .then(apply(by(ask("claim", "agent"), "b2"), "", ""))
      .then(all { assert(claimedBy == "b2"), apply(ask("submit-output", "agent"), "", "claude") })
      .then(all { assert(lastOut == refuse("forbidden")), apply(by(ask("submit-output", "agent"), "agent-7"), "", "claude") })
      .then(all { assert(lastOut == refuse("forbidden")), apply(by(ask("submit-output", "agent"), "b2"), "", "claude") })
      .then(all { assert(status == "in-verification"), apply({ ...checker("b1", "codex"), actor_id: "agent-7" }, "fail", "") })
      .then(all { assert(lastOut == refuse("forbidden")), apply(checker("b1", "codex"), "fail", "") })
      .then(all { assert(lastOut.allowed), apply(ask("revise", "agent"), "", "") })
      .then(all { assert(lastOut == refuse("forbidden")), apply(by(ask("revise", "agent"), "b2"), "", "") })
      .then(all { assert(status == "in-work"), init })

  run acceptNeedsPreCheckTest =
    toVerification
      .then(apply(ask("accept", "human"), "", ""))
      .then(all { assert(lastOut == refuse("missing-pre-check")), apply(ask("accept", "agent"), "", "") })
      .then(all { assert(lastOut == refuse("not-human")), apply({ ...ask("accept", "human"), digest_matches: false }, "", "") })
      .then(all { assert(lastOut == refuse("unsigned")), init })

  run failedPreCheckRevisesTest =
    toVerification
      .then(apply(checker("b2", "codex"), "fail", ""))
      .then(all { assert(lastOut.allowed), apply(ask("accept", "human"), "", "") })
      .then(all { assert(lastOut == refuse("reason-required")), apply(ask("revise", "agent"), "", "") })
      .then(all { assert(status == "in-work"), assert(preCheck == ""), apply(ask("submit-output", "agent"), "", "claude") })
      .then(all { assert(status == "in-verification"), apply(checker("b1", "codex"), "pass", "") })
      .then(all { assert(lastOut == refuse("not-independent")), init })
}
