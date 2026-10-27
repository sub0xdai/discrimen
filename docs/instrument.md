# Judgment quality

A judgment depends on three things: the model, the state representation, and the
question text.
Pin all three, or the reading is not comparable with the next one.

## Judgment vs decision

A judgment is an assessment against a criterion: "option A is 80% safer", or "this
customer sounds angry".
A decision is a commitment to an action based on that judgment.

Faster, cheaper, or more numerous judgments do not by themselves produce correct
decisions.
A decision starts with a goal and a set of possible actions.
Those actions determine which distinctions matter, which determines the
representation, which determines the judgments that can be made over it.

## Representation

Decomposing a question assumes you know the decomposition.
For a startup pitch, "rate market size, technical feasibility, and differentiation"
assumes those dimensions are independent, additive, and complete.
If distribution also matters and is absent, high scores on the other three still give
the wrong decision.

The representation problem has three parts:

1. Which variables?
2. Which relationships between them?
3. Which rule maps them to the decision?

Jev answers a narrower question: given this variable or relationship, what value
should the distinction take?

A judgment can be correct relative to the representation while the decision is wrong
because the representation was incomplete.
Example: terse replies and agitated body language suggest anger, while the actual cause
is a deadline.
The judgment may be right about the evidence and wrong about the person.

## What the eval showed

Run against Jev with local data:

- When the relevant variable or relationship was already present in the state, and the
  question asked about it directly, performance was good.
- When the model had to infer which relationships mattered, performance was poor.
- The amount of evidence mattered less than whether the evidence made the subject
  identifiable.

## State requirements

The state does not need to represent everything.
It needs to preserve the semantic distinction being judged, the way a thermometer
sensor only needs to respond reliably to temperature.

Two kinds of distinction:

- Deterministic: tests, interactions, lines changed.
  Compute these in code.
- Semantic: "does this claim match this citation", "is this customer angry".
  These are candidates for Jev.

Two questions to ask before sending a request:

- Do I know what I want to ask?
- Is what I need to answer it present in the state?

## Validating the tuple

Keep the contract stable and verify that readings match reality.

- Pin the question text.
  "Is the customer angry" and "is the customer dissatisfied" are different inferences.
- Keep the state and evidence in a fixed schema.
  Otherwise the structure of the evidence becomes an unmeasured variable.
- Measure outcome accuracy, not only judgment scores.
  A judgment of 0.92 does not mean the resulting decision is 92% likely to be correct.
- Run an outer loop that compares decisions against outcomes.

Any change to the state shape, question text, or model is a version bump.
Readings from before and after must not be averaged.

## Integration

1. Record observations of what happens, then form hypotheses about which distinctions
   affect the success rate.
2. Build the state from the distinctions that survive.
3. Keep the representation falsifiable.
   Unknown unknowns cannot be enumerated, so design the loop to acquire a variable when
   it turns out to matter: an extra Jev query, another model, or a human.
4. Treat unexpected outcomes, or previously valid cases going wrong, as a signal that
   something upstream is wrong.

Two known uses:

- Classify a task against skill names and descriptions, then load the selected skill
  before the main model sees the request.
- Classify task drift on each state transition using the task contract, the delta, and a
  checklist.
  Wire the signal to a threshold that can redirect, escalate, or pause the agent.

Do not ask Jev to recover the decision model.
A router that receives task text and model latency/success metrics and is asked "which
model should handle this task" requires Jev to infer both the task type and how the
metrics trade off against the goal.
Ask semantic questions instead: "does this task need repository-wide reasoning", "does
it require visual capabilities".
Combine those judgments with deterministic metrics in code.

## Build or buy

Use Jev when the distinction matters, its value requires semantic inference, the
relevant evidence is present, and the setup has been validated.

Build a classifier when the cost of a dataset and maintenance is lower than the
judgment cost, when regulation requires ownership, or when Jev's accuracy is
insufficient.
GLIClass is one example of that approach.

## Checklist

- The distinction is semantic, not computable.
- The question text is pinned and versioned.
- The state schema is fixed and contains the evidence needed to identify the subject.
- The model is pinned to a version.
- Outcome accuracy is measured outside the judgment loop.
- A fallback is declared before the call.
- A missing variable causes acquisition or escalation, not a forced answer.

## Summary

- A universal classifier removes the need to train one classifier per judgment.
  It does not remove the need to know what you are measuring.
- Use Jev when you know which distinction matters, its value requires semantic
  inference, and the setup has been validated.
- If the distinction is computable, use code.
  If you do not know what matters, that is a representation problem, not a model
  problem.
