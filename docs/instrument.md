# Qualifying the instrument

Field notes from the original build. The point of them: a judgment is only as good as
the instrument that produced it, and the instrument is the tuple of the model, the state
representation, and the question text. Pin all three or the reading means nothing.

JEV TIP 001:

Stop wasting your main model’s tokens figuring out which skill to load.

Use JEV to classify the task against skill names + short descriptions, then inject the selected skill directly into the prompt before it reaches the model

JEV TIP 002: 

Run JEV outside the loop to track task drift.

On each state transition, send the task contract + the delta + a checklist to classify drift.

Wire the signal into a fuse to trip after a crossed threshold, and then it can redirect, escalate, or pause the agent.

JEV: Cheap Judgment, Hard Decisions
Jev is @typesafeai
's latest release, labeled as The First (Public) System One Model.  

For those who haven't spent a rainy afternoon reading 'Thinking Fast and Slow', System One is the name Daniel Kahneman gives to one of the two modes of cognitive processing.

System One is fast, automatic and requires little effort. You use it when you're doing something that's relatively easy to complete or repetitive. Things like recognising a friend's face or the emotion in someone's tone of voice. 

It operates through association; connecting what you see or experience to patterns or concepts stored in your memory, which lets you generate judgements faster.

Is this what JEV is? Not exactly.

Jev takes input in the form of a given state and typed questions and returns a structured answer in return.
It acts like a semantic classifier. Give it some state, tell it the property you want to measure and it returns a judgement. Which raises an interesting question...
What counts as a decision? 
One common mistake is conflating judgment and decision.
A judgement is when you make an assessment of something relative to some criterion or standard.  "Option A is 80% safer" or "This customer sounds angry". A decision is when you commit to an action based on that judgement.  
If you can make judgements faster, at lower cost and produce them in larger quantities, it doesn't necessarily mean you've unlocked the ability to make the right decisions. Those metrics don't inherently lead to an increase in correctness.
A decision often starts with some goal and a set of possible actions you can choose from.
Those actions determine which distinctions are relevant, and in turn, determine how you represent the problem. You then make judgements over that representation, and then make a decision by choosing an action, and observing the result.
But if I have a goal and there's three possible actions I can take, I need some way of distinguishing between those actions, and that means I need to decide what information matters. 

Without doing that, I can't construct a representation that honours those distinctions. And once I have that representation, I can make a judgement over it to choose and act.

If I make judgements faster, I can choose faster.

If I make judgements cheaper, each decision costs less.

If I can produce a thousand in parallel, I can make more decisions.

But none of these solve the harder problem:
How do I know the distinctions I chose actually represent what matters for achieving the goal? 
Jev's documentation explains that the model is able to make "the kind of judgment a highly knowledgeable person could make in a few seconds given the right context....If the question you want to ask would require extended reasoning or weighs multiple independent factors, decompose it.....
For example, instead of “rate this startup pitch,” ask separately about market size, technical feasibility, and differentiation. Combine the scores with your own formula."

This is what I mean about the representation problem. And to be clear, I'm not saying @typesafeai
 is misrepresenting their model. They're quite clear that the burden of the representation is on you. What's unclear is how much of a burden that is.
Why can't it be simple as decomposing the question and recombining the output using your own formula?
The first issue is that decomposing assumes you know what the problem decomposes into.  Take the startup formula; ask separately about market size, technical feasibility, and differentiation. 
Are those independent dimensions that can be added together?  What happens if you miss something?

You could have Market Size: 0.94, Technical Feasibility: 0.91 and Differentiation at 0.88, and regardless of formula, still fail because you forgot to represent Distribution which was 0.

This means that  "Decompose and Combine" are better represented as three questions:

    Which variables?
    Which relationships between them?
    Which rule maps them to the decision?

JEV works downstream of this: 
Given this represented variable or relation, what value should I assign to the distinction I'm trying to measure?
This is where some implementations are going wrong. They're implicitly asking JEV to recover parts of the decision model (which variables matter, how they relate, or how they can be combined) and treating the output as validation of the inferred model.
The problem is that judgement can be correct relative to the representation you supplied while the decision is completely wrong because the representation was incomplete or incorrect. An example to help here is when you ask someone if they're angry with you. 

The representation you have could be that their responses are terse, they aren't replying as fast as they normally do and their body language seems agitated.

When in reality, it could be that they have an impending deadline they're worried about and their behaviour has nothing to do with you.
This is what I learnt when running evals on JEV. When the relevant variable or relation was already present and the question was asked directly, it performed great. When it had to infer which relationships mattered as models of the domain, it didn't. 
What's counterintuitive is  the amount of evidence was much less important than whether the evidence made what I was asking about identifiable. 
This gave me a way to approach JEV because what I need to answer is:

    Do I know what I want to ask?
    Is what I need to answer the question present in the state I'm sending with the question?

And this brings us to the world of...
Metrology
Metrology is the study of what makes a measurement meaningful and trustworthy. If I hand you a stick and say it's 1.000 metres long, we automatically have a set of metrological questions to answer like: 

What defines a metre?
How was the rod measured?
How was the instrument calibrated?

A thermometer doesn't need a complete representation of the room. Its sensor only needs to respond reliably to the property we're trying to measure. 

JEV works in a similar way,  the supplied state doesn't need to contain everything, only enough information to preserve the semantic distinction you're asking it to judge.

Now the representation you feed it is chosen by the distinctions that matter, and there's two kinds:

The first is where the distinction can be observed deterministically. Things like tests, interaction, lines of code changed, and so on.

The second is where recognising what matters requires semantic inference. 
Questions like "How can you design a system that can tell the customer is angry?" or "Does this claim match this citation?"

That's where JEV becomes useful but there is a catch. 

When you decide that something requires semantic judgement, you still need to qualify the instrument you use. And so when you outsource that to JEV, what you're actually qualifying is the following tuple:
(model, state representation, question)

How do you qualify the measurement?
The way to qualify a measurement tool is keep the contract stable and verify the readings match reality.

This means the questions that you ask should be pinned because asking whether a customer is angry or whether the customer is dissatisfied are two different semantic inferences. 

You also want to keep the state you feed it and the evidence in a fixed schema because without consistency, you don't actually know whether the structure of the evidence affects the semantic inference. 

Measuring the outcome accuracy is also important because getting 0.92 on a judgement doesn't mean that the decision is 92% likely to be correct. And having an outer loop that compares the decisions made using JEV against the outcomes you predicted is how you tell if it's actually working.
What does a JEV integration or system actually look like?
The integration is relatively simple. 

The first step is to figure out what matters relative to the goal. You can do this by recording observations of what happens so you can generate new hypotheses to test which distinctions affect your success rate.
But the interesting problem is the  one you can’t actually solve up front, which is the unknown unknowns.
Let’s take the startup example: How do you know you haven’t missed something? 

The answer is you can't. 

Unfortunately, there isn't a field you can add that tells you if your representation is complete.  Instead, the smarter approach is to make the representation falsifiable.
If you realise there is a variable that can help, design the loop to go and acquire that variable when it matters. Which could mean using an additional JEV query, outsourcing to a different model, or escalating to a human.

If the system begins to produce outcomes that weren't expected or previously valid cases start to go awry, then it's a trigger to start investigating because something upstream could be wrong.
Here's an example from the docs :  "Use Jev to build a custom router that chooses which LLM receives each prompt." 
Suppose you give JEV:
json

{
  "task": {
    "description": "Refactor the authentication layer across the repository",
    "deadline_minutes": 180
  },
  "models": {
    "A": {
      "median_latency": 40,
      "retry_rate": 0.10,
      "success_rate": 0.92
    },
    "B": {
      "median_latency": 15,
      "retry_rate": 0.28,
      "success_rate": 0.84
    }
  }
}

and ask "Which model should handle this task?"

There are a few problems with this approach; JEV needs to first figure out what kind of task it is and then it needs to decide how the model metrics affect the choice in relation to the goal you're trying to achieve.

A more thoughtful approach is to use JEV in areas where you need semantic interpretation. You can ask questions like "Does this task need repository-wide reasoning?" or  "Does it require visual capabilities?".

And once you have a valid separation, you can combine the deterministic facts and metrics with the semantic properties you're measuring to build a better routing policy.
Should you train your own classifier?
The answer is it depends. 

If the work required in building a dataset and maintaining your own classifier is more costly than using JEV (whilst accuracy is stable), then you should stick with JEV. 
Another reason might be your industry requires you to own your own model or JEV isn't as accurate as you need. That's where building and managing your own classifier can make sense.  GLIClass
 is a good example of how you can approach building similar solutions.
Once you've mapped out the system correctly for the problem you're trying to solve, you'll end up with something similar to this: 

    TLDR: A universal classifier removes the need to train a classifier for every semantic judgment. It doesn't remove the need to know what you're trying to measure. 

    Use JEV when you know which distinction matters, its value requires semantic inference, and JEV is accurate enough in a representation you've actually qualified. 

    If the distinction is computable, use code. If you don't know what matters, that's a different problem.
