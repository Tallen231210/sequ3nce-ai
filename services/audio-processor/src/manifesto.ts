/**
 * Default Sales Call Manifesto
 *
 * This universal framework is used when a business has no custom config.
 * It defines the stages of a sales call, expected behaviors, and key moments.
 */

// Re-export types from types.ts for consistency
export type { ManifestoStage, ManifestoObjection, CallManifesto } from "./types.js";
import type { CallManifesto } from "./types.js";

export const DEFAULT_MANIFESTO: CallManifesto = {
  stages: [
    {
      id: "stage_intro",
      name: "Introduction / Rapport / Framing",
      goal: "Show up powerful, take control, frame the call",
      goodBehaviors: [
        "High energy, fully present",
        "Limited small talk, get to business quickly",
        "Take control of the conversation early",
        "Frame the call with time awareness",
        "Set clear expectations for the call"
      ],
      badBehaviors: [
        "Using casual language like 'mate', 'bro', 'buddy', 'man'",
        "Too much small talk before getting to business",
        "Low energy or seeming distracted",
        "Not taking control of the conversation",
        "Letting the prospect lead the call structure"
      ],
      keyMoments: [
        "Opening question: 'In your opinion, what is the biggest challenge you are having in your [AREA] right now?'"
      ],
      order: 1
    },
    {
      id: "stage_discovery",
      name: "Discovery",
      goal: "Understand severity, get specifics, create ownership",
      goodBehaviors: [
        "Get prospect to explicitly name pain points with specifics and numbers",
        "Use Doctor/Detective/Challenging frame",
        "Ask open-ended questions",
        "Summarize and reframe their info back to them",
        "Get commitment to change",
        "Dig deeper on emotional responses"
      ],
      badBehaviors: [
        "Using minimizing words: 'just', 'little bit', 'kind of'",
        "Buddy-buddy sympathizing frame instead of challenging",
        "Asking binary yes/no questions",
        "Asking double questions back-to-back",
        "Letting prospect play victim without challenging",
        "Forcing opinions instead of leading them to conclusions",
        "Telegraphing questions"
      ],
      keyMoments: [
        "Closing discovery: 'Is there anything else that you feel like we haven't discussed that I need to know?'"
      ],
      order: 2
    },
    {
      id: "stage_transition",
      name: "Transition / Summary",
      goal: "Summarize where they are and where they want to go, get permission to pitch",
      goodBehaviors: [
        "Accurate summary delivered with certainty",
        "Include emotional reasons in the summary",
        "Get verbal confirmation before moving on",
        "Bridge pain to solution naturally"
      ],
      badBehaviors: [
        "Skipping the summary entirely",
        "Weak or uncertain summary delivery",
        "Not getting confirmation before pitching",
        "Missing emotional elements in recap"
      ],
      keyMoments: [
        "Permission to pitch: 'If you'd like I can walk you through the process of exactly how...'"
      ],
      order: 3
    },
    {
      id: "stage_pitch",
      name: "Pitch",
      goal: "Present the solution naturally and check for understanding",
      goodBehaviors: [
        "Read full pitch completely",
        "Natural flow, practiced delivery",
        "Customize to the prospect's specific situation",
        "Check-ins throughout: 'Everything make sense?'",
        "Temperature check before close"
      ],
      badBehaviors: [
        "Rushing through the pitch",
        "Not customizing to prospect's specific pain",
        "No check-ins during presentation",
        "Monotone or robotic delivery",
        "Reading without conviction"
      ],
      keyMoments: [
        "Temperature check: 'In terms of the process, how do you feel?'",
        "Belief check: 'Do you FEEL like this CAN take you from where you're at now to where you want to be?'",
        "Open questions: 'What questions do you have?' (not 'any questions')"
      ],
      order: 4
    },
    {
      id: "stage_close",
      name: "Close / Objections",
      goal: "Handle objections and close the deal",
      goodBehaviors: [
        "Ask for the sale directly",
        "Handle objections with empathy then redirect",
        "Use tie-downs and assumptive language",
        "Stay confident through objections",
        "Create urgency without pressure"
      ],
      badBehaviors: [
        "Not asking for the sale",
        "Accepting objections at face value",
        "Getting defensive or argumentative",
        "Dropping price too quickly",
        "Showing desperation"
      ],
      keyMoments: [
        "Closing question: 'Based on everything we discussed, are you ready to get started?'"
      ],
      order: 5
    }
  ],
  objections: [
    {
      id: "obj_spouse",
      name: "Spouse/Partner",
      rebuttals: [
        "I completely understand. When you spoke with them before this call, what did they say about you solving this problem?",
        "That makes sense. If they were here right now, what do you think their biggest concern would be?",
        "I hear you. In your experience, does your partner usually support decisions you feel strongly about?"
      ]
    },
    {
      id: "obj_price",
      name: "Price/Money",
      rebuttals: [
        "I understand price is a consideration. Let me ask - if the investment wasn't a factor, would you want to move forward?",
        "That's fair. What would this solution need to do for you to make it worth that investment?",
        "I hear you. Compared to the cost of staying where you are, how does this investment look?"
      ]
    },
    {
      id: "obj_timing",
      name: "Timing",
      rebuttals: [
        "I understand timing is important. What would need to happen for the timing to be right?",
        "That makes sense. If we started now, where would you be in 90 days versus if you wait?",
        "I hear you. What's the cost of waiting another 3-6 months on this?"
      ]
    },
    {
      id: "obj_think",
      name: "Need to think about it",
      rebuttals: [
        "Absolutely, this is a big decision. What specifically do you need to think about?",
        "I understand. What questions do you still have that I can help answer right now?",
        "That's fair. On a scale of 1-10, where are you at in terms of moving forward?"
      ]
    }
  ]
};

/**
 * Get the manifesto for a call - returns custom if available, otherwise default
 */
export function getManifestoForCall(customManifesto?: CallManifesto): CallManifesto {
  if (customManifesto && customManifesto.stages && customManifesto.stages.length > 0) {
    return customManifesto;
  }
  return DEFAULT_MANIFESTO;
}
