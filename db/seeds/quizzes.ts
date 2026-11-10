/**
 * Quiz content seed for VarCamp 2026.
 *
 * Creates six published quizzes:
 *   1. About VarCamp Myanmar
 *   2. Latest Tech News
 *   3. Artificial Intelligence (AI)
 *   4. Cloud Computing
 *   5. Programming Syntax: Web Development
 *   6. Programming Syntax: Backend Development
 *
 * Usage:
 *   node --conditions=react-server --import tsx db/seeds/quizzes.ts
 *
 * Requires DATABASE_URL, SESSION_SECRET and ADMIN_BOOTSTRAP_EMAIL (set to an
 * existing administrator's email). Migrations must already be applied
 * (`pnpm db:migrate`). This script only writes quizzes — it never runs
 * migrations, creates administrators or touches events. Each quiz is skipped
 * when a quiz with the same title already exists, so re-running is safe.
 */
import { Kysely } from "kysely";
import { loadEnvConfig } from "@next/env";

import { ManageQuizzes } from "@/modules/quizzes/application/manage-quizzes";
import { getDb } from "@/lib/db/client";
import { resetServerEnvCache } from "@/lib/config/env";
import type { Database } from "@/lib/db/types";
import type { QuestionType } from "@/lib/domain/enums";

interface SeedOption {
  label: string;
  isCorrect: boolean;
}

interface SeedQuestion {
  prompt: string;
  questionType: QuestionType;
  points: number;
  options: SeedOption[];
}

interface SeedQuiz {
  title: string;
  description: string;
  instructions: string;
  passingScore: number;
  questions: SeedQuestion[];
}

function multipleChoice(
  prompt: string,
  options: string[],
  correctIndex: number,
  points = 1,
): SeedQuestion {
  return {
    prompt,
    questionType: "multiple_choice",
    points,
    options: options.map((label, index) => ({
      label,
      isCorrect: index === correctIndex,
    })),
  };
}

function trueFalse(prompt: string, answer: boolean, points = 1): SeedQuestion {
  return {
    prompt,
    questionType: "true_false",
    points,
    options: [
      { label: "True", isCorrect: answer },
      { label: "False", isCorrect: !answer },
    ],
  };
}

export const quizSeeds: SeedQuiz[] = [
  {
    // Facts checked 2026-11-10 against var.camp, var.camp/sponsor, the VarCamp
    // Facebook/LinkedIn pages and Wikipedia's BarCamp article. VarCamp has no
    // dedicated Wikipedia page; the format's history lives in the BarCamp one.
    // Deliberately no questions about the event date, venue platform or room
    // count: this quiz is taken on opening day, when attendees can observe
    // those facts directly.
    title: "About VarCamp Myanmar",
    description:
      "How well do you know VarCamp — Myanmar's free virtual barcamp? Test yourself on the event, its format and the community behind it.",
    instructions:
      "Seven questions about VarCamp and the barcamp tradition it comes from. Answer every question, then submit once. You will see your result right away.",
    passingScore: 60,
    questions: [
      multipleChoice(
        "What is VarCamp?",
        [
          "A free virtual conference for tech and creative communities",
          "A paid in-person coding bootcamp in Yangon",
          "An online gaming tournament",
          "A university degree programme",
        ],
        0,
      ),
      trueFalse("VarCamp is free for everyone who joins.", true),
      multipleChoice(
        "VarCamp is the virtual version of which in-person event format?",
        ["Hackathon", "TEDx", "BarCamp", "Job fair"],
        2,
      ),
      trueFalse(
        "The first BarCamp was held in Palo Alto in 2005 as an open alternative to Tim O'Reilly's invite-only Foo Camp.",
        true,
        2,
      ),
      multipleChoice(
        "Why did BarCamp Yangon 2013 make headlines around the world?",
        [
          "It was the first barcamp ever held",
          "It was the first barcamp held online",
          "It ran for a full month",
          "Its 6,400+ attendees made it the largest barcamp in the world",
        ],
        3,
        2,
      ),
      multipleChoice(
        "Which communities are among the organisers hosting rooms at VarCamp 2026?",
        [
          "AWS User Group Myanmar, BSides Myanmar and Vibe Code Tours",
          "PyCon US, RustConf and KubeCon",
          "Google Developer Groups only",
          "A single private company",
        ],
        0,
      ),
      trueFalse(
        "WorkAdventure has given VarCamp its virtual venue since VarCamp 2025.",
        true,
      ),
    ],
  },
  {
    // Facts verified 2026-11-10 against primary reporting: shield.ai press
    // release, TechCrunch/CBS (Cybertruck), blog.google + Reuters (Gemini 4
    // Argon), OpenAI DevDay 2026 recap, apple.com newsroom, huawei.com keynote.
    title: "Latest Tech News",
    description:
      "Headlines from September to November 2026 — new AI models, chips, acquisitions and the end of the Cybertruck.",
    instructions:
      "Ten questions based on verified news from September–November 2026. Answer every question, then submit once.",
    passingScore: 60,
    questions: [
      multipleChoice(
        "In November 2026, defence-tech startup Shield AI agreed to acquire radar maker Echodyne in a deal valued at up to how much?",
        ["$2.5 billion", "$530 million", "$5.3 billion", "$28.8 billion"],
        2,
        2,
      ),
      multipleChoice(
        "What does Echodyne, the company Shield AI is acquiring, make?",
        [
          "Electric jet engines",
          "Compact radar systems that detect and track drones",
          "Solid-state batteries",
          "Cloud databases",
        ],
        1,
      ),
      trueFalse(
        "Shield AI's November 2026 funding round values the company at $28.8 billion.",
        true,
      ),
      multipleChoice(
        "Elon Musk announced in November 2026 that Tesla will end Cybertruck production in 2027. What will the factory space be used for instead?",
        [
          "A battery museum",
          "Making more Cybercabs (self-driving taxis)",
          "Electric boats",
          "Nothing — the factory will close",
        ],
        1,
      ),
      multipleChoice(
        "Which flagship AI model did Google launch on 13 October 2026?",
        ["GPT-6.1 Sol", "Gemini 4 Argon", "Claude 5", "Llama 6"],
        1,
      ),
      multipleChoice(
        "At OpenAI DevDay 2026, which model was introduced as matching GPT-6 Astra performance at one-fifth of the price?",
        ["Dots", "o4-mini", "GPT-6.1 Sol", "Codex Max"],
        2,
        2,
      ),
      multipleChoice(
        "What are 'Dots', announced at OpenAI DevDay 2026?",
        [
          "A VR headset",
          "A chip architecture",
          "Always-on agents that keep working between conversations",
          "A new search engine",
        ],
        2,
      ),
      multipleChoice(
        "Which chip powers the iPhone 18 Pro and iPhone 18 Pro Max, announced on 9 September 2026?",
        ["M5 Ultra", "Snapdragon 8 Elite", "Tensor G6", "A20 Pro"],
        3,
      ),
      trueFalse(
        "The iPhone 18 Pro models introduced a variable-aperture camera.",
        true,
      ),
      multipleChoice(
        "At Huawei Connect in September 2026, Huawei moved the launch of which AI chip forward to Q1 2027 — three quarters ahead of its original roadmap?",
        ["Kirin 9030", "Ascend 960DT", "Ascend 310", "Kunpeng 920"],
        1,
        2,
      ),
    ],
  },
  {
    title: "Artificial Intelligence (AI)",
    description:
      "Core concepts behind modern AI — from machine learning basics to large language models.",
    instructions:
      "Thirteen questions on AI fundamentals and real-world scenarios. Answer every question, then submit once. You will see your result right away.",
    passingScore: 60,
    questions: [
      multipleChoice(
        "What does LLM stand for?",
        [
          "Linear Logic Machine",
          "Large Language Model",
          "Layered Learning Model",
          "Long Loop Memory",
        ],
        1,
      ),
      multipleChoice(
        "Which architecture, introduced in the 2017 paper 'Attention Is All You Need', underpins most modern LLMs?",
        ["LSTM", "GAN", "Transformer", "Perceptron"],
        2,
        2,
      ),
      multipleChoice(
        "In generative AI, what is a 'hallucination'?",
        [
          "A training run that crashes",
          "Fluent output that is false or fabricated",
          "A model entering sleep mode",
          "A syntax error in the prompt",
        ],
        1,
      ),
      multipleChoice(
        "What does RAG stand for in LLM applications?",
        [
          "Random Access Generator",
          "Recurrent Attention Gate",
          "Retrieval-Augmented Generation",
          "Rapid Agent Graph",
        ],
        2,
        2,
      ),
      multipleChoice(
        "What does the 'temperature' parameter control when an LLM generates text?",
        [
          "The context window size",
          "The randomness of the output",
          "The number of layers",
          "The price per token",
        ],
        1,
      ),
      trueFalse("Supervised learning trains on labelled examples.", true),
      trueFalse(
        "RLHF stands for Reinforcement Learning from Human Feedback.",
        true,
      ),
      trueFalse(
        "By default, an LLM looks up answers in a live database before responding.",
        false,
      ),
      multipleChoice(
        "What is 'overfitting'?",
        [
          "A model trains too slowly",
          "A dataset has too many labels",
          "A model memorises training data and performs poorly on unseen data",
          "A GPU runs out of memory",
        ],
        2,
      ),
      multipleChoice(
        "What does the 'G' in GPT stand for?",
        ["General", "Graph", "Generative", "Gradient"],
        2,
      ),
      multipleChoice(
        "Your customer-support chatbot confidently invents a refund policy that does not exist. What is this failure mode called?",
        ["Overfitting", "Hallucination", "Quantisation", "Tokenisation"],
        1,
        2,
      ),
      multipleChoice(
        "Your team wants an LLM to answer questions from a private handbook that changes weekly, without retraining the model. Which approach fits best?",
        [
          "Fine-tune the base model once and ship it",
          "Use RAG to retrieve the relevant handbook sections at question time",
          "Raise the temperature so answers are more creative",
          "Ask the model to memorise the handbook during pre-training",
        ],
        1,
        2,
      ),
      trueFalse(
        "A colleague evaluates a model on the same data it was trained on and reports 99% accuracy as proof it will work in production. This is a reliable estimate of real-world performance.",
        false,
        2,
      ),
    ],
  },
  {
    title: "Cloud Computing",
    description:
      "Service models, scaling, regions and the infrastructure ideas behind the cloud.",
    instructions:
      "Thirteen questions on cloud computing fundamentals and real-world scenarios. Answer every question, then submit once.",
    passingScore: 60,
    questions: [
      multipleChoice(
        "Which cloud service model gives you virtual machines, storage and networks to manage yourself?",
        ["SaaS", "IaaS", "PaaS", "DaaS"],
        1,
      ),
      multipleChoice(
        "What does SaaS stand for?",
        [
          "Storage as a Service",
          "Security as a Service",
          "Software as a Service",
          "Servers as a Service",
        ],
        2,
      ),
      multipleChoice(
        "Which company operates AWS?",
        ["Microsoft", "Amazon", "Alibaba", "Oracle"],
        1,
      ),
      multipleChoice(
        "What is horizontal scaling?",
        [
          "Upgrading one server's CPU and RAM",
          "Adding more instances to share the load",
          "Deleting old data",
          "Switching to a different database",
        ],
        1,
        2,
      ),
      multipleChoice(
        "What is a CDN primarily used for?",
        [
          "Compiling containers",
          "Caching content at edge locations close to users",
          "Managing DNS records only",
          "Running SQL queries",
        ],
        1,
      ),
      multipleChoice(
        "Which of these is Amazon's managed Kubernetes service?",
        ["GKE", "AKS", "EKS", "OpenShift"],
        2,
        2,
      ),
      trueFalse(
        "'Serverless' means there are literally no servers involved.",
        false,
      ),
      trueFalse(
        "In object storage such as Amazon S3, files are organised into buckets.",
        true,
      ),
      multipleChoice(
        "In cloud terminology, what is a 'region'?",
        [
          "A type of VM size",
          "A geographic area containing one or more data centres",
          "A pricing tier",
          "A networking protocol",
        ],
        1,
      ),
      multipleChoice(
        "What does 'multi-tenancy' mean?",
        [
          "One customer owns every server",
          "A server is restarted many times",
          "Multiple customers share infrastructure while their data stays isolated",
          "A table has many rows",
        ],
        2,
      ),
      multipleChoice(
        "Your ticketing app goes viral and one server is overwhelmed. You add more identical instances behind a load balancer. What is this called?",
        ["Vertical scaling", "Horizontal scaling", "Defragmentation", "Cold storage"],
        1,
        2,
      ),
      multipleChoice(
        "Users in Myanmar load your site's images slowly because everything is served from a single US data centre. Which service best fixes this?",
        [
          "A bigger relational database",
          "A CDN that caches images at edge locations close to users",
          "Doubling the origin server's RAM",
          "A longer DNS TTL",
        ],
        1,
        2,
      ),
      trueFalse(
        "Your startup runs a ten-minute monthly report job. With a serverless function, you pay only for the compute time the job uses instead of an always-on server.",
        true,
        2,
      ),
    ],
  },
  {
    title: "Programming Syntax: Web Development",
    description:
      "HTML, CSS, JavaScript and TypeScript syntax — the building blocks of the web.",
    instructions:
      "Thirteen questions on web development syntax and real debugging scenarios. Code is shown inline. Answer every question, then submit once.",
    passingScore: 60,
    questions: [
      multipleChoice(
        "Which HTML tag creates a hyperlink?",
        ["<link>", "<a>", "<href>", "<nav>"],
        1,
      ),
      multipleChoice(
        "Which CSS property changes the text colour of an element?",
        ["text-color", "font-color", "color", "text-style"],
        2,
      ),
      multipleChoice(
        'In CSS, how do you select the element with id="app"?',
        [".app", "#app", "app", "@app"],
        1,
      ),
      multipleChoice(
        "What does JavaScript's typeof [] evaluate to?",
        ['"array"', '"list"', '"object"', '"collection"'],
        2,
        2,
      ),
      multipleChoice(
        "What does [1, 2, 3].map(x => x * 2) return in JavaScript?",
        ["[1, 2, 3]", "[2, 4, 6]", "6", "[1, 4, 9]"],
        1,
        2,
      ),
      multipleChoice(
        "How does === differ from == in JavaScript?",
        [
          "It assigns a value",
          "It compares without type coercion",
          "It only compares numbers",
          "There is no difference",
        ],
        1,
      ),
      multipleChoice(
        "In TypeScript, how do you type a value that can be a string or a number?",
        ["string & number", "string + number", "string | number", "string ?? number"],
        2,
        2,
      ),
      trueFalse(
        "In JavaScript, let is block-scoped while var is function-scoped.",
        true,
      ),
      trueFalse(
        "In HTML, the <script> tag can only appear inside <head>.",
        false,
      ),
      multipleChoice(
        'What does JSON.parse(\'{"a":1}\') return in JavaScript?',
        ["A string", "An array", "A JavaScript object", "null"],
        2,
      ),
      multipleChoice(
        "Your stylesheet has .btn { color: blue; } but the button renders red because of #submit { color: red; }. Why does red win?",
        [
          "Class selectors cannot style buttons",
          "The id selector (#submit) has higher specificity than the class selector (.btn)",
          "CSS applies rules in alphabetical order",
          "A class rule can never override an id rule, even with !important",
        ],
        1,
        2,
      ),
      multipleChoice(
        "In your checkout code, '5' == 5 evaluates to true and applies a discount by mistake. Which operator compares value and type without coercion?",
        ["==", "=", "===", "=>"],
        2,
        2,
      ),
      multipleChoice(
        "You generate buttons in a loop declared with var i, and every button's onclick alerts the final value of i instead of its own index. Which fix gives each iteration its own i?",
        [
          "Add a semicolon after each alert",
          "Replace var with let in the loop header",
          "Move the alert call outside the loop",
          "Check typeof i before alerting",
        ],
        1,
        2,
      ),
    ],
  },
  {
    // The quiz UI renders prompts as plain text (whitespace collapses), so every
    // snippet is a single inline line. Each snippet carries a comment naming
    // its language — /* Golang */, /* Java */ or # Python — as requested.
    title: "Programming Syntax: Backend Development",
    description:
      "Read real Go, Java and Python snippets and predict what they do. Every snippet includes a comment naming its language.",
    instructions:
      "Thirteen code-reading questions in Golang, Java and Python, including real-world bug scenarios. Each snippet has a comment identifying its language, and code is shown inline. Answer every question, then submit once.",
    passingScore: 60,
    questions: [
      multipleChoice(
        "What does this Golang snippet print? /* Golang */ fmt.Println(7 % 3)",
        ["2", "1", "0", "2.33"],
        1,
        2,
      ),
      multipleChoice(
        "What does this Java code print? /* Java */ System.out.println(10 / 3);",
        ["3.333...", "3", "3.0", "It does not compile"],
        1,
        2,
      ),
      multipleChoice(
        'What does this Java code print? /* Java */ System.out.println("ab" + 1 + 2);',
        ["ab3", "3ab", "ab12", "12ab"],
        2,
        2,
      ),
      multipleChoice(
        "Which operator declares and initialises a new variable in Go, as in /* Golang */ x := 10?",
        ["=", "==", ":=", "=>"],
        2,
      ),
      multipleChoice(
        "What does this Python code print? print(2 ** 3)  # Python",
        ["6", "9", "8", "5"],
        2,
        2,
      ),
      multipleChoice(
        'In what order does this Golang code print? /* Golang */ defer fmt.Print("A"); defer fmt.Print("B"); fmt.Print("C")',
        ["ABC", "CBA", "BAC", "ACB"],
        1,
        2,
      ),
      multipleChoice(
        "What does this Python code print? print(10 // 4)  # Python",
        ["2.5", "2", "3", "0.4"],
        1,
        2,
      ),
      multipleChoice(
        "Which Java keyword prevents a method from being overridden, as in /* Java */ public final void run() {}?",
        ["static", "volatile", "final", "transient"],
        2,
      ),
      multipleChoice(
        "What does this Golang code print? /* Golang */ var n int; fmt.Println(n)",
        ["null", "0", "undefined", "It does not compile"],
        1,
        2,
      ),
      trueFalse(
        "This Java code prints 0: /* Java */ int[] a = new int[3]; System.out.println(a[0]);",
        true,
        2,
      ),
      multipleChoice(
        'Your Java login check uses /* Java */ String a = new String("secret"); System.out.println(a == "secret"); and rejects users with the correct password. What prints?',
        ["true", "false", "null", "It does not compile"],
        1,
        2,
      ),
      multipleChoice(
        'Your Go service crashes on its first request at /* Golang */ var cache map[string]int; cache["hits"] = 1. Why?',
        [
          "Maps cannot store int values",
          "The map is nil — writing to a nil map panics, so initialise it with make first",
          "String keys are not allowed in maps",
          "cache must be declared with new before any read",
        ],
        1,
        2,
      ),
      multipleChoice(
        "Your Python API helper is defined as def add_item(item, cart=[]): cart.append(item); return cart  # Python — and callers report items leaking between requests. Why?",
        [
          "Python copies the default list on every call",
          "The default list is created once at definition time and shared across calls",
          "append() replaces the list instead of mutating it",
          "Lists are not allowed as default arguments",
        ],
        1,
        2,
      ),
    ],
  },
];

async function resolveAdministrator(db: Kysely<Database>): Promise<string> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();

  if (!email) {
    throw new Error(
      "Set ADMIN_BOOTSTRAP_EMAIL to an existing administrator's email before seeding quizzes.",
    );
  }

  const administrator = await db
    .selectFrom("administrators")
    .select("id")
    .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
    .executeTakeFirst();

  if (!administrator) {
    throw new Error(
      `No administrator found for ${email}. Run pnpm db:seed first, or point ADMIN_BOOTSTRAP_EMAIL at an existing admin.`,
    );
  }

  return administrator.id;
}

async function seedQuiz(
  db: Kysely<Database>,
  administratorId: string,
  seed: SeedQuiz,
): Promise<void> {
  const manage = new ManageQuizzes(db);

  const existing = await db
    .selectFrom("quizzes")
    .select("id")
    .where("title", "=", seed.title)
    .executeTakeFirst();

  if (existing) {
    console.log(`Skipped "${seed.title}" — a quiz with this title already exists.`);
    return;
  }

  const quiz = await manage.create(
    { title: seed.title, description: seed.description },
    administratorId,
  );

  await manage.updateSettings(quiz.id, {
    instructions: seed.instructions,
    passingScore: seed.passingScore,
    certificateEnabled: "true",
  });

  for (const question of seed.questions) {
    await manage.addQuestion(quiz.id, question);
  }

  await manage.publish(quiz.id);

  console.log(`Published "${seed.title}" -> /quizzes/${quiz.public_id}`);
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  resetServerEnvCache();

  const db = getDb();
  const administratorId = await resolveAdministrator(db);

  for (const seed of quizSeeds) {
    await seedQuiz(db, administratorId, seed);
  }

  console.log("Quiz seed complete.");
  await db.destroy();
}

// Guarded so the seed data can be imported (e.g. for validation or tests)
// without connecting to a database.
if (process.argv[1]?.endsWith("quizzes.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}