/**
 * The privacy policy shown in the app (Profile → Privacy policy). Same text as
 * docs/PRIVACY_POLICY.md, which is the copy to publish on the website; change both together.
 * DRAFT for the pilot: written from the app's real data flows, not legal advice, and to be
 * reviewed (health-data laws, SECURITY.md) before the public launch.
 */
export const PRIVACY_VERSION = "pilot-2026-10-16";
export const PRIVACY_UPDATED = "October 16, 2026";

export const PRIVACY_SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "The short version",
    body: [
      "Adapt uses what you tell it about your training to build and adjust your HYROX plan. We don't sell your data, show ads, or share it with advertisers.",
      "You can export everything we store about you, or delete your account and all of it, from Profile at any time.",
    ],
  },
  {
    title: "What we collect",
    body: [
      "Account: your email address and password. Passwords are handled by our sign-in provider and stored only in scrambled (hashed) form.",
      "Your answers: race and division, goal, experience, past results and splits, weekly running, a recent benchmark, training days and time, equipment, and movements you want to avoid. We ask for movements to avoid, not medical diagnoses.",
      "Your training logs: what you did, distance, time, heart rate if you enter it, effort, pain level and where, and any notes.",
      "What the app works out from these: your plan, its versions, and each change the plan made and why.",
      "Leaderboard, only if you join it: a nickname you choose and, if you join one, your gym.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To build your plan, adjust it after each workout, and explain every change.",
      "To show the leaderboard, if you opted in. Other athletes see only your nickname, plan completion, days trained and sessions logged. They never see your workouts, paces, effort, pain or notes.",
      "To keep the service working and secure. We don't use your data for advertising or sell it.",
    ],
  },
  {
    title: "Who else handles it",
    body: [
      "Supabase stores the data and runs the servers that build your plan, in the United States. It processes the data for us and doesn't use it for its own purposes.",
      "If you send feedback by email, your email provider and ours handle that message.",
      "We don't currently connect to Apple Health, Garmin, Strava or any other service. If we add one, you'll choose to turn it on, and this policy will say what is read and why.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "Export: Profile → Export my data gives you everything we store about you as a file.",
      "Correct: edit your answers and your logs in the app at any time.",
      "Leaderboard: leave it from the Leaderboard tab whenever you want; you disappear from every board at once.",
      "Delete: Profile → Delete my account permanently removes your account and all your data, history included. It can't be undone.",
    ],
  },
  {
    title: "Keeping it safe",
    body: [
      "The database itself makes sure each athlete can read and change only their own records, and we test that on every change.",
      "Plans and the record of plan changes are written only by our server, so they can't be altered from a phone.",
      "No method of storage is perfectly secure, but we only keep what the plan needs.",
    ],
  },
  {
    title: "How long we keep it",
    body: ["For as long as you have an account. When you delete it, your data is removed from the live database straight away; backups kept by our provider expire on their normal schedule."],
  },
  {
    title: "Not medical advice",
    body: ["The app gives training guidance, not medical advice, and it doesn't diagnose injuries. If something hurts or you feel unwell, stop and speak to a doctor or physiotherapist."],
  },
  {
    title: "Age",
    body: ["Adapt is for adults 18 and over."],
  },
  {
    title: "Changes and contact",
    body: [
      "If we change this policy we'll update the date below and, for meaningful changes, tell you in the app.",
      "Questions or requests: use Profile → Send feedback.",
    ],
  },
];
