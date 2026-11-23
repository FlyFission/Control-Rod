You are reviewing a proposed change to an open-source repository before it is merged. The
repository in your working directory already has the change applied. You did not write it.

Decide whether the change resolves the issue correctly and completely, without breaking other
behavior. Read the code around the change as needed. Do not edit any file.

<issue>
{{issue}}
</issue>

<diff>
{{diff}}
</diff>

End your answer with exactly one verdict block, as JSON:

<verdict>{"verdict": "pass" or "fail", "defects": ["one short line per defect you found"]}</verdict>

Use "fail" only for a defect you can point to in the change. Use "pass" when you would merge it.
