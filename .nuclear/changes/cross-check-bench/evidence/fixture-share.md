Control Rod benchmark run fixture-dryrun: one author agent, then a checker agent, on 4 fixture tasks (a dry run, not a result).

Tests alone accepted 8/8 (100%, 95% CI 68%–100%); 4 of those failed the hidden tests.
A same-model checker caught 3/4 (75%, 95% CI 30%–95%) of the unresolved patches and rejected 2/4 (50%, 95% CI 15%–85%) of the good ones.
A checker from the other vendor caught 3/4 (75%, 95% CI 30%–95%) and rejected 2/4 (50%, 95% CI 15%–85%) of the good ones.
With a person signing off last: 2/8 (25%, 95% CI 7%–59%) accepted, 0.0 human minutes.

What this is not: one run, two vendors, small n, agent calls not seeded. Hidden tests are the ground truth, and passing tests is not the same as mergeable.
Every input, patch, verdict and script is in the repo, so you can re-run it.

Control Rod is open source and free. Try it today: https://github.com/FlyFission/Control-Rod
