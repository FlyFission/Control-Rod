You are reviewing a proposed change to an open-source repository. The repository in your working
directory already has the change applied and staged, uncommitted, so `git diff HEAD` shows all of
it, new files included. You did not write it. The source tree is read-only. Put any file you
create in the scratch directory `{{scratch}}`.

Decide whether the change resolves the issue correctly and completely, without introducing
regressions in other behavior. Judge functional correctness only, not style. Read the code around
the change and run the repository's tests if that helps.

<issue>
{{issue}}
</issue>

Changed paths:

{{changed}}

<diff>
{{diff}}
</diff>

End your answer with exactly one verdict block holding strict JSON with exactly two keys:
"verdict" ("pass" or "fail") and "defects" (a list). Each defect has exactly two keys: "location"
(a file and line or function in the change) and "reason" (one short sentence). A "fail" must cite
at least one defect; a "pass" has an empty list. For example:

<verdict>{"verdict": "fail", "defects": [{"location": "src/util.py:42 parse()", "reason": "returns None for an empty string instead of raising ValueError as the issue asks"}]}</verdict>

<verdict>{"verdict": "pass", "defects": []}</verdict>

Return only one verdict block.
