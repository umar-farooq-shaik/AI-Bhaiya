import { Router, type IRouter } from "express";
import {
  AskTutorBody,
  AskTutorResponse,
  EvaluateAssessmentBody,
  EvaluateAssessmentResponse,
  EvaluateExerciseBody,
  EvaluateExerciseResponse,
  GenerateAssessmentBody,
  GenerateAssessmentResponse,
  GenerateJobGapBody,
  GenerateJobGapResponse,
  GenerateLessonBody,
  GenerateLessonResponse,
  GenerateRoadmapBody,
  GenerateRoadmapResponse,
  GetJobsResponse,
  GetTrendsResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const geminiUrl =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const daySeconds = 60 * 60 * 24;

type ResponseSchema<T> = { parse: (value: unknown) => T };

async function generateJson<T>(
  schema: ResponseSchema<T>,
  prompt: string,
  fallback: () => T,
): Promise<{ data: T; mode: "ai" | "demo" }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { data: fallback(), mode: "demo" };

  try {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.35,
          maxOutputTokens: 8192,
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Gemini request failed; using demo response",
      );
      return { data: fallback(), mode: "demo" };
    }

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini response was empty");
    const jsonText = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return { data: schema.parse(JSON.parse(jsonText)), mode: "ai" };
  } catch (error) {
    logger.warn(
      {
        reason:
          error instanceof Error && error.name === "TimeoutError"
            ? "timeout"
            : "invalid-response-or-network-error",
      },
      "Gemini response unavailable; using demo response",
    );
    return { data: fallback(), mode: "demo" };
  }
}

function modulesFor(
  goal: string,
  level: string,
  gaps: string[],
  addTopics: string[] = [],
) {
  const topics = [
    ...gaps,
    "How large language models work",
    "Prompt engineering",
    "Practical AI tools",
    "Building with LLM APIs",
    "AI automation",
    "AI agents",
    "Your first AI project",
    ...addTopics,
  ];
  const unique = [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))]
    .slice(0, 8);
  return unique.map((title, index) => ({
    id: `module-${index + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
    title,
    description: `Build practical knowledge of ${title.toLowerCase()} for your goal: ${goal}.`,
    difficulty:
      index === 0 ? level : index < 3 ? "Foundations" : "Applied",
    estimatedMinutes: index < 2 ? 20 : 30,
    status: index === 0 ? "current" : index < 3 ? "recommended" : "locked",
    reason:
      index === 0
        ? "This starts with the most important gap from your assessment."
        : `Recommended for your goal and current ${level.toLowerCase()} level.`,
    skills: [title, index > 2 ? "Practical application" : "Core concepts"],
  }));
}

const fallbackAssessment = () => ({
  questions: [
    {
      id: "ai-basics",
      topic: "AI fundamentals",
      prompt: "Which statement best explains what sets a learned AI model apart from a fixed rule set?",
      choices: ["It learns patterns from examples", "It follows only if/then rules", "I'm not sure yet"],
    },
    {
      id: "prompting",
      topic: "Prompting",
      prompt: "Which instruction is most likely to produce a useful AI response?",
      choices: ["Clear goal and useful context", "More complicated words", "I'm not sure yet"],
    },
    {
      id: "llms",
      topic: "LLMs",
      prompt: "How does a language model generate a response?",
      choices: ["Predicts likely next tokens", "Looks up a single fixed answer", "I'm not sure yet"],
    },
    {
      id: "building",
      topic: "Building with AI",
      prompt: "Which choice best describes your experience connecting an app to an AI model API?",
      choices: ["Yes, in a project", "I've tried a tutorial", "Not yet"],
    },
  ],
  mode: "demo",
});

router.post("/learning/assessment", async (req, res): Promise<void> => {
  const parsed = GenerateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { goal, experience } = parsed.data;
  const prompt = `Create a concise adaptive multiple-choice AI learning assessment for this learner. Goal: ${goal}. AI knowledge: ${experience.aiKnowledge}. Programming knowledge: ${experience.programmingKnowledge}. AI tool experience: ${experience.toolExperience}. Previous projects: ${experience.previousProjects}. Return JSON only with exactly this shape: {"questions":[{"id":"short-id","topic":"topic","prompt":"clear multiple-choice question","choices":["correct or plausible answer","plausible distractor","I'm not sure yet"]}],"mode":"ai"}. Produce four short multiple-choice questions relevant to their goal and experience. Each question must have exactly three concise answer choices; include "I'm not sure yet" as one choice. Do not reveal which choice is correct or include explanations.`;
  const result = await generateJson(
    GenerateAssessmentResponse,
    prompt,
    fallbackAssessment,
  );
  res.json({ ...result.data, mode: result.mode });
});

router.post("/learning/assessment/evaluate", async (req, res): Promise<void> => {
  const parsed = EvaluateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const fallback = () => {
    const answers = input.answers.map((item) => item.answer.toLowerCase()).join(" ");
    const strengths = [
      ...(answers.includes("prompt") || answers.includes("context")
        ? ["You already think about giving AI useful instructions."]
        : []),
      ...(input.experience.previousProjects.toLowerCase().includes("yes")
        ? ["You have experience learning by building."]
        : []),
    ];
    return {
      level: input.experience.aiKnowledge.toLowerCase().includes("advanced")
        ? "Intermediate"
        : "Beginner",
      strengths: strengths.length ? strengths : ["You have a clear learning goal and are ready to build from the basics."],
      gaps: ["AI fundamentals", "How language models work", "Building with AI APIs"],
      recommendedStartingPoint: "AI fundamentals",
      roadmap: modulesFor(input.goal, "Beginner", ["AI fundamentals"]),
      mode: "demo",
    };
  };
  const prompt = `Evaluate this learner's short AI assessment fairly. Their goal is ${input.goal}; time available each day: ${input.dailyTime}; background: ${JSON.stringify(input.experience)}. Their answers are: ${JSON.stringify(input.answers)}. Return valid JSON only matching {"level":"Beginner|Early intermediate|Intermediate|Advanced","strengths":["specific strength"],"gaps":["specific skill gap"],"recommendedStartingPoint":"one topic","roadmap":[{"id":"short-id","title":"topic","description":"brief","difficulty":"Beginner|Intermediate|Advanced","estimatedMinutes":20,"status":"current|recommended|locked|needs practice","reason":"why this fits this learner","skills":["skill"]}],"mode":"ai"}. Create 5-7 ordered modules. Skip concepts they have clearly mastered, keep prerequisites before advanced topics, and explain recommendations using their answers.`;
  const result = await generateJson(
    EvaluateAssessmentResponse,
    prompt,
    fallback,
  );
  res.json({ ...result.data, mode: result.mode });
});

router.post("/learning/roadmap", async (req, res): Promise<void> => {
  const parsed = GenerateRoadmapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const fallback = () =>
    modulesFor(input.goal, input.level, input.gaps, input.addTopics);
  const prompt = `Adapt a learning roadmap for goal ${input.goal}; level ${input.level}; daily time ${input.dailyTime}; strengths ${JSON.stringify(input.strengths)}; knowledge gaps ${JSON.stringify(input.gaps)}; extra topics to include ${JSON.stringify(input.addTopics)}; existing roadmap ${JSON.stringify(input.existingRoadmap)}. Return JSON array only. Every item must have id,title,description,difficulty,estimatedMinutes,status,reason,skills. Preserve completed items and avoid repeating mastered skills. Add prerequisite learning for gaps and place requested extra topics in a sensible order. Use statuses current, recommended, locked, or needs practice. Return 4-8 modules.`;
  const result = await generateJson(GenerateRoadmapResponse, prompt, fallback);
  res.json(result.data);
});

router.post("/learning/lesson", async (req, res): Promise<void> => {
  const parsed = GenerateLessonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { topic, level, goal } = parsed.data;
  const fallback = () => ({
    title: topic,
    estimatedMinutes: 12,
    learn: `${topic} is easier to learn when you connect the idea to something you already know. Start with the core concept, then test it on a small real task connected to your goal: ${goal}.`,
    analogy: "Think of learning this skill like adding a new tool to a workshop: first learn what it does, then choose the right job for it.",
    example: `For example, someone learning ${topic} can take one small everyday task, describe the desired result, and check whether the method produces a useful and reliable outcome.`,
    tryIt: `Write down one task you would like to do with ${topic}. What information would you need, and how would you check the result?`,
    exercisePrompt: `Create a clear, practical example that demonstrates ${topic}. Explain the goal, the steps, and how you would verify the result.`,
    checkQuestion: `What is one sign that you should use ${topic} for a task, and one way you would check its result?`,
    mode: "demo",
  });
  const prompt = `Write one clear AI learning lesson adapted for a ${level} learner whose goal is ${goal}. Topic: ${topic}. Return JSON only with title, estimatedMinutes (integer), learn (short explanation), analogy (simple analogy), example (real-world example), tryIt (small interactive activity), exercisePrompt (practical written exercise), checkQuestion (one short understanding check), mode. Avoid jargon unless explained. Make it concrete and not a wall of text.`;
  const result = await generateJson(GenerateLessonResponse, prompt, fallback);
  res.json({ ...result.data, mode: result.mode });
});

router.post("/learning/exercise/evaluate", async (req, res): Promise<void> => {
  const parsed = EvaluateExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { topic, level, task, submission } = parsed.data;
  const fallback = () => {
    const words = submission.trim().split(/\s+/).length;
    const score = Math.max(38, Math.min(86, 42 + Math.round(words / 5)));
    return {
      score,
      mastery: score >= 70 ? "Getting comfortable" : "Building the basics",
      strengths: ["You made a concrete attempt and explained your thinking."],
      improvements: ["Add clearer context and describe how you would check the result."],
      feedback: "Good start. A strong practical answer states the goal, gives enough context, and includes a way to judge whether the result is useful.",
      nextStep: `Try the task again with a specific example of ${topic}.`,
      mastered: score >= 80,
      mode: "demo",
    };
  };
  const prompt = `Evaluate this learner's practical work in ${topic}. Level: ${level}. Task: ${task}. Submission: ${submission}. Be constructive and specific, not overly generous. Return JSON only with score (integer 0-100), mastery (short label), strengths (1-3 strings), improvements (1-3 strings), feedback (brief useful explanation), nextStep (one action), mastered (boolean: true only if score >= 80), mode.`;
  const result = await generateJson(EvaluateExerciseResponse, prompt, fallback);
  res.json({ ...result.data, mode: result.mode });
});

router.post("/learning/tutor", async (req, res): Promise<void> => {
  const parsed = AskTutorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { question, profile } = parsed.data;
  const fallback = () => ({
    answer: `Let's make this simpler. Your goal is ${profile.goal}, and you're learning at a ${profile.level.toLowerCase()} level. ${question} Start with the main idea, connect it to something familiar, then try it on one small example. If you share which part is confusing, I can break that part down further.`,
    challenge: `In one or two sentences, explain ${question.replace(/[?!.]+$/, "")} using an everyday example.`,
    mode: "demo",
  });
  const prompt = `You are AI Bhaiya, a patient and practical older-sibling mentor, not a generic chatbot. Learner profile: ${JSON.stringify(profile)}. Learner asks: ${question}. Explain at their level, use a simple analogy if useful, guide them to learn rather than only giving a terse answer, and end with one optional 2-minute challenge. Return JSON only with answer, challenge, mode.`;
  const result = await generateJson(AskTutorResponse, prompt, fallback);
  res.json({ ...result.data, mode: result.mode });
});

router.get("/discover/trends", async (req, res): Promise<void> => {
  const since = Math.floor(Date.now() / 1000) - 60 * daySeconds;
  const topics = [
    { term: "Claude Code", title: "Claude Code", category: "AI tool", difficulty: "Intermediate", time: "2–4 hours", summary: "An AI coding assistant discussed in recent developer conversations.", lesson: "AI-assisted coding" },
    { term: "OpenAI Codex", title: "OpenAI Codex", category: "AI tool", difficulty: "Intermediate", time: "2–4 hours", summary: "An AI coding agent and software development workflow.", lesson: "AI coding agents" },
    { term: "AI agents", title: "AI agents", category: "AI skill", difficulty: "Intermediate", time: "3–5 hours", summary: "Systems that use a model, tools, and a feedback loop to complete tasks.", lesson: "Build an AI agent" },
    { term: "Model Context Protocol", title: "Model Context Protocol", category: "AI skill", difficulty: "Intermediate", time: "2–3 hours", summary: "A common way for AI apps to connect with external tools and context.", lesson: "Connect tools to AI" },
    { term: "RAG retrieval augmented generation", title: "RAG", category: "AI skill", difficulty: "Intermediate", time: "3–5 hours", summary: "A way to give a language model relevant information before it answers.", lesson: "Build a RAG feature" },
  ];

  try {
    const trends = await Promise.all(
      topics.map(async (topic) => {
        const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
        url.searchParams.set("query", topic.term);
        url.searchParams.set("tags", "story");
        url.searchParams.set("numericFilters", `created_at_i>${since}`);
        url.searchParams.set("hitsPerPage", "1");
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Public discussion feed unavailable");
        const data = (await response.json()) as {
          nbHits?: number;
          hits?: Array<{ objectID?: string; points?: number; title?: string; url?: string; created_at?: string }>;
        };
        const hit = data.hits?.[0];
        return {
          ...topic,
          id: topic.term.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          mentions: data.nbHits ?? 0,
          score: hit?.points ?? 0,
          learningTime: topic.time,
          relatedLesson: topic.lesson,
          sourceUrl: hit?.objectID
            ? `https://news.ycombinator.com/item?id=${hit.objectID}`
            : hit?.url || `https://hn.algolia.com/?q=${encodeURIComponent(topic.term)}`,
        };
      }),
    );
    const recentTopics = trends
      .filter((topic) => topic.mentions > 0)
      .sort((a, b) => b.mentions - a.mentions);
    if (!recentTopics.length) throw new Error("No recent discussion data");
    const parsed = GetTrendsResponse.parse({
      rangeLabel: "Live discussions from the past 60 days",
      source: "Hacker News public search",
      generatedAt: new Date().toISOString(),
      trends: recentTopics,
    });
    res.json(parsed);
  } catch {
    req.log.warn("Hacker News trend feed unavailable; returning curated topics");
    res.json(
      GetTrendsResponse.parse({
        rangeLabel: "Curated recommendations — live 60-day data unavailable",
        source: "AI Bhaiya curated starter topics",
        generatedAt: new Date().toISOString(),
        trends: topics.map((topic) => ({
          ...topic,
          id: topic.term.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          mentions: 0,
          score: 0,
          learningTime: topic.time,
          relatedLesson: topic.lesson,
          sourceUrl: "",
        })),
      }),
    );
  }
});

router.get("/discover/jobs", async (req, res): Promise<void> => {
  const demoJobs = [
    {
      id: "demo-ai-engineer",
      title: "Generative AI Engineer",
      company: "Demo listing",
      location: "Remote",
      experienceLevel: "Demo",
      tags: ["Python", "LLM APIs", "RAG"],
      source: "Demo data — not a live vacancy",
      applyUrl: "",
      remote: true,
    },
    {
      id: "demo-ai-developer",
      title: "AI Application Developer",
      company: "Demo listing",
      location: "Remote",
      experienceLevel: "Demo",
      tags: ["JavaScript", "React", "AI agents"],
      source: "Demo data — not a live vacancy",
      applyUrl: "",
      remote: true,
    },
  ];
  const sourceUrl = "https://remoteok.com/remote-ai-jobs";

  try {
    const response = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "AIBhaiyaLearningPlatform/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("Job feed unavailable");
    const rows = (await response.json()) as Array<{
      id?: string | number;
      position?: string;
      company?: string;
      location?: string;
      tags?: string[];
      date?: string;
      url?: string;
      apply_url?: string;
    }>;
    const sixtyDaysAgo = Date.now() - 60 * daySeconds * 1000;
    const jobs = rows
      .filter((job) => job.position && job.company && (job.tags?.length ?? 0) > 0)
      .filter((job) => {
        const title = job.position ?? "";
        const tags = (job.tags ?? []).join(" ");
        const technicalRole =
          /engineer|developer|software|programmer|data scientist|ml scientist|research engineer/i.test(
            title,
          );
        const aiRole =
          /\bai\b|machine learning|\bml\b|llm|generative|prompt engineer|ai agent/i.test(
            `${title} ${tags}`,
          );
        const programmingSkill =
          /\bpython\b|javascript|typescript|\breact\b|node\.?js|golang|java\b|c\+\+|machine learning|llm|rag|ai agent/i.test(
            tags,
          );
        const recent = job.date
          ? new Date(job.date).getTime() >= sixtyDaysAgo
          : true;
        return recent && technicalRole && (aiRole || programmingSkill);
      })
      .slice(0, 40)
      .map((job) => {
        const title = job.position!;
        const tags = job.tags ?? [];
        const experienceText = `${title} ${tags.join(" ")}`;
        const experienceLevel =
          /\b(intern|internship|entry[\s-]?level|junior|jr\.?|graduate|new grad|fresher)\b/i.test(
            experienceText,
          )
            ? "Entry level / Junior"
            : /\b(senior|sr\.?|staff|principal|lead)\b/i.test(experienceText)
              ? "Senior"
              : /\b(mid[\s-]?level)\b/i.test(experienceText)
                ? "Mid"
                : "See listing";
        return {
          id: String(job.id ?? `${job.company}-${title}`),
          title,
          company: job.company!,
          location: job.location || "Remote",
          experienceLevel,
          tags: [...new Set(tags)].slice(0, 8),
          ...(job.date && { postedAt: new Date(job.date).toISOString() }),
          source: "Remote OK",
          applyUrl: job.apply_url || job.url || "",
          remote: true,
        };
      });
    res.json(
      GetJobsResponse.parse({
        source: "Remote OK public job feed",
        sourceUrl,
        fetchedAt: new Date().toISOString(),
        demo: false,
        jobs,
      }),
    );
  } catch {
    req.log.warn("Remote OK job feed unavailable; returning labeled demo roles");
    res.json(
      GetJobsResponse.parse({
        source: "AI Bhaiya demo data — not live vacancies",
        sourceUrl: "",
        fetchedAt: new Date().toISOString(),
        demo: true,
        jobs: demoJobs,
      }),
    );
  }
});

router.post("/discover/jobs/gap", async (req, res): Promise<void> => {
  const parsed = GenerateJobGapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const normalizedSkills = (skills: string[]) =>
    new Map(skills.map((skill) => [skill.trim().toLowerCase(), skill]));
  const knownMap = normalizedSkills(input.userSkills);
  const known = input.requiredSkills.filter((skill) => knownMap.has(skill.toLowerCase()));
  const missing = input.requiredSkills.filter((skill) => !knownMap.has(skill.toLowerCase()));
  const fallback = () => ({
    matchPercent: input.requiredSkills.length
      ? Math.round((known.length / input.requiredSkills.length) * 100)
      : 100,
    known,
    missing,
    roadmap: modulesFor(input.goal, input.level, missing),
    mode: "demo",
  });
  const prompt = `Compare learner skills ${JSON.stringify(input.userSkills)} to the requirements for ${input.role}: ${JSON.stringify(input.requiredSkills)}. Goal: ${input.goal}; current level: ${input.level}; daily learning time: ${input.dailyTime}. Matched skills: ${JSON.stringify(known)}; missing skills: ${JSON.stringify(missing)}. Return JSON only with matchPercent integer 0-100, known, missing, roadmap (ordered prerequisite-first modules with id,title,description,difficulty,estimatedMinutes,status,reason,skills), and mode. Do not mark skills mastered unless matched; focus on realistic skill-building steps.`;
  const result = await generateJson(GenerateJobGapResponse, prompt, fallback);
  res.json({ ...result.data, mode: result.mode });
});

export default router;