import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  useAskTutor, useEvaluateAssessment, useEvaluateExercise, useGenerateAssessment,
  useGenerateJobGap, useGenerateLesson, useGenerateRoadmap, useGetJobs, useGetTrends,
} from '@workspace/api-client-react';
import type {
  AssessmentAnswer, AssessmentInput, AssessmentQuestion, ExerciseFeedback, Job, JobGapResult,
  Lesson, RoadmapModule, TutorResponse,
} from '@workspace/api-client-react';
import {
  ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Check, ChevronRight,
  CircleHelp, Clock3, Flame, GraduationCap, Lightbulb, ListChecks, MessageCircle, RefreshCw, Search,
  Sparkles, Target, TrendingUp, Trophy,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const STORE_KEY = 'ai-bhaiya-guest-v1';

type GuestProfile = {
  name: string; goal: string; dailyTime: string; level: string; strengths: string[]; gaps: string[];
  experience: { aiKnowledge: string; programmingKnowledge: string; toolExperience: string; previousProjects: string };
};
type GuestState = {
  profile: GuestProfile; modules: RoadmapModule[]; completed: string[]; practiceCount: number;
  streak: number; minutes: number; assessmentMode?: string; lesson?: Lesson;
  lessonTopic?: string; mastery: Record<string, number>;
};
const defaultState: GuestState = {
  profile: {
    name: 'Learner', goal: '', dailyTime: '20 minutes', level: 'Getting started', strengths: [],
    gaps: [], experience: { aiKnowledge: 'New to AI', programmingKnowledge: 'A little', toolExperience: 'Just exploring', previousProjects: '' },
  },
  modules: [
    { id: 'foundations', title: 'AI, without the fog', description: 'Build a clear mental model for what AI can and cannot do.', difficulty: 'Beginner', estimatedMinutes: 18, status: 'in_progress', reason: 'A strong starting point for your goals.', skills: ['AI foundations', 'Prompting'] },
    { id: 'prompts', title: 'Give better instructions', description: 'Shape useful prompts with context, constraints and examples.', difficulty: 'Beginner', estimatedMinutes: 22, status: 'locked', reason: 'Turn your new mental model into a practical skill.', skills: ['Prompt engineering'] },
    { id: 'workflow', title: 'Build an AI workflow', description: 'Connect the right tool to a real task in your day.', difficulty: 'Intermediate', estimatedMinutes: 28, status: 'locked', reason: 'Practice applying AI to your own work.', skills: ['AI workflows'] },
  ],
  completed: [], practiceCount: 0, streak: 0, minutes: 0, mastery: {},
};

function loadGuest(): GuestState {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (!stored) return defaultState;
    const parsed = JSON.parse(stored) as Partial<GuestState>;
    return {
      ...defaultState,
      ...parsed,
      profile: { ...defaultState.profile, ...parsed.profile, experience: { ...defaultState.profile.experience, ...parsed.profile?.experience } },
      mastery: { ...defaultState.mastery, ...parsed.mastery },
    };
  } catch { return defaultState; }
}
type LearningContextType = {
  state: GuestState;
  update: (patch: Partial<GuestState>) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
};
const LearningContext = createContext<LearningContextType | null>(null);
function useLearning() {
  const value = useContext(LearningContext);
  if (!value) throw new Error('Learning context is unavailable');
  return value;
}

const navItems = [
  { href: '/', label: 'Your learning desk', icon: GraduationCap },
  { href: '/roadmap', label: 'My roadmap', icon: ListChecks },
  { href: '/learn', label: 'Learn', icon: BookOpen },
  { href: '/practice', label: 'Practice', icon: Target },
  { href: '/tutor', label: 'Ask Bhaiya', icon: MessageCircle },
  { href: '/trending', label: 'What’s moving', icon: TrendingUp },
  { href: '/jobs', label: 'Find your next role', icon: BriefcaseBusiness },
  { href: '/progress', label: 'My progress', icon: Trophy },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { state } = useLearning();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark">भ</span><span>AI Bhaiya</span></Link>
      <div className="nav-label">Your learning</div>
      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`nav-${href.replace('/', '') || 'home'}`}><Icon size={17} strokeWidth={1.8}/>{label}</Link>)}
      </nav>
      <div className="sidebar-note">
        <strong>One step at a time.</strong>
        <p>Your plan moves at your pace. Pick up wherever you left off.</p>
        <Link href="/tutor">Talk it through <ArrowRight size={12}/></Link>
      </div>
    </aside>
    <main className="main">
      <div className="mobile-head">
        <Link href="/" className="mobile-brand"><span className="brand-mark">भ</span>AI Bhaiya</Link>
        <div className="avatar" aria-label={`${state.profile.name} guest profile`}>{state.profile.name.slice(0, 1).toUpperCase()}</div>
      </div>
      {children}
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={location === href ? 'active' : ''} aria-label={label} data-testid={`mobile-nav-${href.replace('/', '') || 'home'}`}><Icon/><span>{label.split(' ')[0]}</span></Link>)}
    </nav>
  </div>;
}

function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const { state, searchQuery, setSearchQuery } = useLearning();
  const [, navigate] = useLocation();
  return <header className="topline"><div className="page-heading"><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div><div className="topline-actions"><form className="global-search" role="search" onSubmit={e=>{e.preventDefault();if(searchQuery.trim())navigate('/search');}}><Search size={15}/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} aria-label="Search lessons, skills, and jobs" placeholder="Search anything to learn" data-testid="input-global-search"/><button type="submit" aria-label="Search" data-testid="button-global-search"><ArrowRight size={14}/></button></form><div className="avatar" title="Guest learner">{state.profile.name.slice(0, 1).toUpperCase()}</div></div></header>;
}
function ModeNote({ mode }: { mode?: string }) {
  if (!mode) return null;
  const isFallback = /fallback|demo|mock/i.test(mode);
  return <span className={`badge ${isFallback ? 'orange' : ''}`} data-testid="status-ai-mode"><Sparkles size={12}/>{isFallback ? `Fallback mode · ${mode}` : `AI mode · ${mode}`}</span>;
}
function ErrorMessage({ retry, message }: { retry: () => void; message?: string }) {
  return <div className="error-box" role="alert"><span>{message || 'That didn’t come through. Your work is safe — try again.'}</span><button className="btn btn-secondary" onClick={retry} data-testid="button-retry"><RefreshCw size={13}/> Retry</button></div>;
}
function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="loading-lines" aria-label="Loading"><div className="skeleton" style={{ width: '44%', height: 20 }}/>{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - (i % 3) * 14}%` }}/>)}</div>;
}
function EmptyState({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-mark"><Lightbulb size={21}/></div><h3>{title}</h3><p>{description}</p>{action && <button className="btn" onClick={onAction}>{action}<ArrowRight size={14}/></button>}</div>;
}
function PageFrame({ children }: { children: ReactNode }) { return <AppShell>{children}</AppShell>; }

function HomePage() {
  const { state, update } = useLearning();
  const done = state.completed.length;
  const next = state.modules.find(m => !state.completed.includes(m.id)) || state.modules[0];
  const start = () => { update({ streak: state.streak || 1 }); };
  return <PageFrame>
    <PageHeader eyebrow="Your learning desk" title={`Good to see you, ${state.profile.name}.`} subtitle={state.profile.goal ? `We’re building toward ${state.profile.goal.toLowerCase()} — one useful idea at a time.` : 'A thoughtful AI learning plan, shaped around what you already know and where you want to go.'}/>
    {!state.profile.goal && <div className="panel hero-panel" style={{ marginBottom: 22 }}>
      <div className="eyebrow" style={{ color: '#edbb76' }}>A good place to begin</div><h2>AI can feel big. We’ll make it feel doable.</h2>
      <p>Tell me what you’re working toward. I’ll meet you at your level, find the gaps that matter, and make a plan that fits your day.</p>
      <Link href="/onboarding" className="btn">Make my learning plan <ArrowRight size={15}/></Link>
      <div className="hero-art" aria-hidden="true"><span className="hero-glyph">अ</span></div>
    </div>}
    {state.profile.goal && <div className="panel hero-panel" style={{ marginBottom: 22 }} data-testid="card-resume-learning">
      <div className="eyebrow" style={{ color: '#edbb76' }}>Your next small win</div><h2>{next?.title || 'Your learning path is ready'}</h2>
      <p>{next?.description || 'Pick up with your next lesson and keep building confidence.'}</p>
      <Link href="/learn" onClick={start} className="btn">Resume learning <ArrowRight size={15}/></Link>
      <div className="hero-art" aria-hidden="true"><span className="hero-glyph">अ</span></div>
    </div>}
    <div className="stat-row" style={{ marginBottom: 22 }}>
      <div className="stat"><strong>{done}<span style={{ fontSize: 14, color: '#918371' }}> / {state.modules.length}</span></strong><span>lessons finished</span></div>
      <div className="stat"><strong>{state.streak}<span style={{ fontSize: 14, color: '#918371' }}> days</span></strong><span>learning streak</span></div>
      <div className="stat"><strong>{state.minutes}<span style={{ fontSize: 14, color: '#918371' }}> min</span></strong><span>time invested</span></div>
    </div>
    <div className="content-grid">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">Your path</div><h2 style={{ marginTop: 5 }}>Made for your next step</h2></div><Link href="/roadmap" className="btn btn-quiet">See roadmap <ArrowRight size={13}/></Link></div>
        {state.modules.slice(0, 3).map((module, i) => <div className="row-link" key={module.id} data-testid={`module-home-${module.id}`}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className={`empty-mark ${state.completed.includes(module.id) ? 'badge' : ''}`} style={{ width: 32, height: 32, margin: 0, borderRadius: '50%' }}>{state.completed.includes(module.id) ? <Check size={14}/> : <span style={{ fontSize: 11, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>}</span><div><h4>{module.title}</h4><p>{module.estimatedMinutes} min · {module.difficulty}</p></div></div><ChevronRight size={16} color="#9b8b79"/></div>)}
      </section>
      <section className="stack">
        <div className="panel"><div className="panel-head"><h3>Keep a little rhythm</h3><Flame size={19} color="#ce7628"/></div><p className="tiny">Learning sticks when you come back to it.</p><div className="streak-dots">{['M','T','W','T','F','S','S'].map((d,i)=><span className={`streak-dot ${i < state.streak ? 'done' : ''}`} key={`${d}${i}`}>{d}</span>)}</div><Link href="/progress" className="btn btn-secondary" style={{ marginTop: 15 }}>View progress <ArrowRight size={13}/></Link></div>
        <div className="panel" style={{ background: '#e7ece1' }}><div className="eyebrow">Your mentor’s here</div><h3 style={{ margin: '8px 0' }}>A question is a great next step.</h3><p className="tiny" style={{ lineHeight: 1.6, marginBottom: 14 }}>Ask for another explanation, a real-world example, or a nudge when you’re stuck.</p><Link href="/tutor" className="btn btn-navy"><MessageCircle size={14}/> Ask Bhaiya</Link></div>
      </section>
    </div>
  </PageFrame>;
}

function OnboardingPage() {
  const { state, update } = useLearning();
  const [goal, setGoal] = useState(state.profile.goal);
  const [time, setTime] = useState(state.profile.dailyTime);
  const standardTimes = ['15 minutes', '30 minutes', '1 hour', '2+ hours'];
  const customTime = !standardTimes.includes(time);
  const [ai, setAi] = useState(state.profile.experience.aiKnowledge);
  const [programming, setProgramming] = useState(state.profile.experience.programmingKnowledge);
  const [tools, setTools] = useState(state.profile.experience.toolExperience);
  const [projects, setProjects] = useState(state.profile.experience.previousProjects);
  const [name, setName] = useState(state.profile.name === 'Learner' ? '' : state.profile.name);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showAssessment, setShowAssessment] = useState(false);
  const assessment = useGenerateAssessment();
  const evaluate = useEvaluateAssessment();
  const payload: AssessmentInput = { goal: goal.trim(), dailyTime: time.trim(), experience: { aiKnowledge: ai, programmingKnowledge: programming, toolExperience: tools, previousProjects: projects.trim() } };
  const generate = () => {
    if (!goal.trim() || !time.trim()) return;
    assessment.mutate({ data: payload }, { onSuccess: result => { setQuestions(result.questions); setShowAssessment(true); update({ profile: { ...state.profile, ...(name ? { name } : {}), goal, dailyTime: payload.dailyTime, experience: payload.experience }, assessmentMode: result.mode }); } });
  };
  const submit = () => {
    const submitted: AssessmentAnswer[] = questions.map(q => ({ questionId: q.id, question: q.prompt, answer: answers[q.id] || '' }));
    evaluate.mutate({ data: { ...payload, answers: submitted } }, { onSuccess: result => {
      const updatedProfile = { ...state.profile, ...(name ? { name } : {}), goal, dailyTime: payload.dailyTime, level: result.level, strengths: result.strengths, gaps: result.gaps, experience: payload.experience };
      update({ profile: updatedProfile, modules: result.roadmap, assessmentMode: result.mode });
    } });
  };
  if (state.profile.goal && state.modules.length && !showAssessment && !assessment.data && !evaluate.data) return <PageFrame><PageHeader eyebrow="Set your direction" title="Your learning plan is in place." subtitle="You can always retune it as your goals change."/><section className="panel"><div className="badge"><Check size={13}/> Learning path ready</div><h2 style={{ margin: '15px 0 8px' }}>{state.profile.goal}</h2><p className="page-subtitle">You’re set for {state.profile.dailyTime} a day. Your current level: {state.profile.level}.</p><Link href="/roadmap" className="btn" style={{ marginTop: 18 }}>View my roadmap <ArrowRight size={14}/></Link> <button className="btn btn-secondary" onClick={() => update({ profile: { ...state.profile, goal: '' } })}>Adjust my plan</button></section></PageFrame>;
  return <PageFrame><PageHeader eyebrow="A few questions first" title={showAssessment ? 'Let’s find your starting point.' : 'What are you learning for?'} subtitle={showAssessment ? 'No grades here. This just helps me tailor the first lessons.' : 'A little context helps your AI Bhaiya make a plan that feels like yours.'}/>
    {!showAssessment ? <div className="content-grid">
      <section className="panel"><form className="form-stack" onSubmit={e=>{e.preventDefault();generate();}}>
        <div><label className="field-label" htmlFor="goal">What would you like AI to help you do?</label><textarea id="goal" className="textarea" placeholder="For example: use AI to speed up my design work, or build my first AI-powered app" value={goal} onChange={e=>setGoal(e.target.value)} data-testid="input-learning-goal" required/></div>
        <div className="form-row"><div><label className="field-label" htmlFor="learner-name">What should I call you?</label><input id="learner-name" className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name (optional)" data-testid="input-learner-name"/></div><div><label className="field-label" htmlFor="daily-time">Time you can spend most days</label><select id="daily-time" className="select" value={customTime?'Custom':time} onChange={e=>setTime(e.target.value==='Custom'?(customTime?time:''):e.target.value)} data-testid="select-daily-time">{standardTimes.map(option=><option key={option}>{option}</option>)}<option>Custom</option></select>{customTime&&<input className="input" style={{marginTop:8}} value={time} onChange={e=>setTime(e.target.value)} placeholder="e.g. 25 minutes a day" aria-label="Custom daily learning time" data-testid="input-custom-daily-time"/>}</div></div>
        <div><span className="field-label">How familiar are you with AI?</span><div className="choice-group">{['New to AI','Know a little','Use it often'].map(v=><button type="button" key={v} className={`choice ${ai===v?'selected':''}`} onClick={()=>setAi(v)} data-testid={`choice-ai-${v.toLowerCase().replaceAll(' ','-')}`}>{v}</button>)}</div></div>
        <div><span className="field-label">How comfortable are you with programming?</span><div className="choice-group">{['Not yet','A little','Comfortable'].map(v=><button type="button" key={v} className={`choice ${programming===v?'selected':''}`} onClick={()=>setProgramming(v)} data-testid={`choice-programming-${v.toLowerCase().replaceAll(' ','-')}`}>{v}</button>)}</div></div>
        <div><span className="field-label">How much have you used AI tools?</span><div className="choice-group">{['Just exploring','A few times','Regularly'].map(v=><button type="button" key={v} className={`choice ${tools===v?'selected':''}`} onClick={()=>setTools(v)} data-testid={`choice-tools-${v.toLowerCase().replaceAll(' ','-')}`}>{v}</button>)}</div></div>
        <div><label className="field-label" htmlFor="projects">Anything you’ve already tried? <span className="tiny">(optional)</span></label><input id="projects" className="input" value={projects} onChange={e=>setProjects(e.target.value)} placeholder="A project, a tool, or something you made" /></div>
        {assessment.isError && <ErrorMessage retry={generate}/>}
        <button className="btn" type="submit" disabled={assessment.isPending||!time.trim()} data-testid="button-create-assessment">{assessment.isPending ? 'Finding the right questions…' : 'Continue to a quick check'}<ArrowRight size={15}/></button>
      </form></section>
      <section className="stack"><div className="panel" style={{ background: '#e8ede3' }}><div className="eyebrow">A note from Bhaiya</div><h3 style={{ margin: '10px 0' }}>This isn’t a test.</h3><p className="copy-block" style={{ fontSize: 13 }}>It’s a way to skip what you already know and spend your time on the bits that will actually help. Your answers stay on this device in guest mode.</p><div className="divider"/><div className="check-row"><Check size={14}/> Short lessons, paced for your day</div><div className="check-row" style={{ marginTop: 10 }}><Check size={14}/> Practice shaped around your goal</div><div className="check-row" style={{ marginTop: 10 }}><Check size={14}/> No grades, no account, no pressure</div></div></section>
    </div> : <section className="panel" style={{ maxWidth: 780 }}>
      {assessment.isPending ? <Skeleton/> : questions.length ? <><div className="badge"><CircleHelp size={13}/> {questions.length} quick questions</div><div className="form-stack" style={{ marginTop: 18 }}>{questions.map((q,index)=><div key={q.id} data-testid={`assessment-question-${q.id}`}><h3 style={{ marginBottom: 12 }}>{index+1}. {q.prompt}</h3><div className="form-stack" style={{ gap: 8 }}>{q.choices.map((choice,i)=><label key={choice} className="assessment-choice"><input type="radio" name={q.id} checked={answers[q.id]===choice} onChange={()=>setAnswers({ ...answers, [q.id]: choice })}/><span>{choice}</span></label>)}</div></div>)}</div>
        {evaluate.isError && <ErrorMessage retry={submit}/>}<button className="btn" style={{ marginTop: 20 }} onClick={submit} disabled={evaluate.isPending || questions.some(q=>!answers[q.id])} data-testid="button-submit-assessment">{evaluate.isPending ? 'Putting your plan together…' : 'Build my learning path'}<ArrowRight size={14}/></button></> : <><p className="page-subtitle">I couldn’t create the questions just now.</p><button className="btn" onClick={generate}>Try again</button></>}
      {evaluate.data && <div style={{ marginTop: 20 }} data-testid="assessment-result"><ModeNote mode={evaluate.data.mode}/><h2 style={{ marginTop: 12 }}>Your starting point: {evaluate.data.recommendedStartingPoint}</h2><p>Strengths: {evaluate.data.strengths.join(', ') || 'Ready to explore'}. We’ll focus on {evaluate.data.gaps.join(', ') || 'building confidence'}.</p><Link href="/roadmap" className="btn">See your path</Link></div>}
    </section>}
  </PageFrame>;
}

function RoadmapPage() {
  const { state, update, setSearchQuery } = useLearning();
  const [, navigate] = useLocation();
  const [add, setAdd] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const roadmap = useGenerateRoadmap();
  const addTopic = () => {
    const list = [...new Set([...add.split(',').map(s=>s.trim()).filter(Boolean), newTopic.trim()].filter(Boolean))];
    if (!list.length) return;
    roadmap.mutate({ data: { goal: state.profile.goal || 'Learn practical AI skills', level: state.profile.level, dailyTime: state.profile.dailyTime, strengths: state.profile.strengths, gaps: state.profile.gaps, existingRoadmap: state.modules, addTopics: list } }, { onSuccess: modules => { update({ modules }); setAdd(''); setNewTopic(''); } });
  };
  const regenerate = () => roadmap.mutate({ data: { goal: state.profile.goal || 'Learn practical AI skills', level: state.profile.level, dailyTime: state.profile.dailyTime, strengths: state.profile.strengths, gaps: state.profile.gaps, existingRoadmap: state.modules, addTopics: [] } }, { onSuccess: modules => update({ modules }) });
  return <PageFrame><PageHeader eyebrow="Your personal route" title="A roadmap that can move with you." subtitle={state.profile.goal ? `Built around: ${state.profile.goal}` : 'Start with a learning check, then make this path your own.'}/>
    <div className="content-grid">
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">Learning sequence</div><h2 style={{ marginTop: 5 }}>Small steps, useful skills</h2></div><ModeNote mode={state.assessmentMode}/></div>
        {state.modules.length ? state.modules.map((module,index)=>{const completed=state.completed.includes(module.id);return <article key={module.id} className="row-link" style={{ alignItems: 'flex-start', padding: '18px 0' }} data-testid={`roadmap-module-${module.id}`}><div style={{ display: 'flex', gap: 14, flex: 1 }}><div className={`empty-mark ${completed?'badge':''}`} style={{ width: 36, height: 36, margin: 0, flexShrink: 0, borderRadius: '50%' }}>{completed?<Check size={15}/>:String(index+1).padStart(2,'0')}</div><div style={{ flex: 1 }}><div className="lesson-meta">{module.status} <span>·</span> {module.estimatedMinutes} min <span>·</span> {module.difficulty}</div><h3 style={{ margin: '7px 0 5px' }}>{module.title}</h3><p className="tiny" style={{ lineHeight: 1.55, margin: '0 0 9px' }}>{module.description}</p><p className="tiny" style={{ color: '#a0764c', margin: '0 0 10px' }}>{module.reason}</p><div className="tag-list">{module.skills?.map(skill=><span className="tag" key={skill}>{skill}</span>)}</div><Link href="/learn" onClick={()=>setSearchQuery(module.title)} className="btn btn-secondary" style={{ marginTop: 12 }}>{completed?'Review lesson':'Open lesson'}<ArrowRight size={13}/></Link></div></div></article>}) : <EmptyState title="Your path is ready to be mapped." description="Tell me what you want to do with AI and we’ll shape your first steps." action="Set my goal" onAction={()=>navigate('/onboarding')}/>}
        {roadmap.isError && <ErrorMessage retry={regenerate}/>}
      </section>
      <section className="stack"><div className="panel" style={{ background:'#e9ede3' }}><div className="eyebrow">Make it yours</div><h3 style={{ margin:'8px 0' }}>Add a skill to your route</h3><p className="tiny" style={{ lineHeight:1.55, marginBottom:14 }}>Tell Bhaiya about a tool or role skill you’d like to work toward.</p><label className="field-label" htmlFor="add-skill">Skill or topic</label><input className="input" id="add-skill" placeholder="e.g. AI for product design" value={newTopic} onChange={e=>setNewTopic(e.target.value)} data-testid="input-add-roadmap-skill"/><label className="field-label" htmlFor="add-more" style={{ marginTop:12 }}>More skills <span className="tiny">(comma separated, optional)</span></label><input className="input" id="add-more" placeholder="e.g. RAG, evaluation" value={add} onChange={e=>setAdd(e.target.value)} data-testid="input-additional-roadmap-skills"/>{roadmap.isError&&<ErrorMessage retry={addTopic}/>}<button className="btn" style={{ width:'100%', marginTop:14 }} onClick={addTopic} disabled={roadmap.isPending || (!newTopic.trim()&&!add.trim())} data-testid="button-add-roadmap-skill">{roadmap.isPending?'Updating your route…':'Add to my roadmap'}<ArrowRight size={14}/></button></div><div className="panel"><h3>Why this order?</h3><p className="tiny" style={{ lineHeight:1.7, marginTop:9 }}>The path starts with the ideas that unlock everything else. As you practice, we’ll adjust what comes next to match your strengths and gaps.</p><button className="btn btn-secondary" style={{ marginTop:10 }} onClick={regenerate} disabled={roadmap.isPending} data-testid="button-refresh-roadmap"><RefreshCw size={13}/> Refresh my path</button></div></section>
    </div>
  </PageFrame>;
}

function LearnPage() {
  const { state, update, searchQuery, setSearchQuery } = useLearning();
  const selected = state.modules.find(module=>module.title.toLowerCase()===searchQuery.trim().toLowerCase());
  const current = selected || state.modules.find(m=>!state.completed.includes(m.id)) || state.modules[0];
  const topic = current?.title || 'AI foundations';
  const [lesson, setLesson] = useState<Lesson | undefined>(state.lessonTopic===topic?state.lesson:undefined);
  const [tab, setTab] = useState<'learn'|'example'|'tryIt'|'check'>('learn');
  const [checkAnswer, setCheckAnswer] = useState('');
  const generator = useGenerateLesson();
  const activeLesson=state.lessonTopic===topic?lesson:undefined;
  useEffect(()=>{
    setTab('learn');
    setCheckAnswer('');
    if(state.lessonTopic===topic)setLesson(state.lesson);
    else {setLesson(undefined);if(state.lesson||state.lessonTopic)update({lesson:undefined,lessonTopic:undefined});}
  },[topic]);
  const getLesson = () => generator.mutate({ data: { topic, level: state.profile.level, goal: state.profile.goal || 'Understand practical AI' } }, { onSuccess: result=>{setLesson(result);update({lesson:result,lessonTopic:topic});} });
  const markComplete = () => {
    if (!current || state.completed.includes(current.id)) return;
    const completed=[...new Set([...state.completed,current.id])];
    const nextIndex=state.modules.findIndex(module=>!completed.includes(module.id));
    const modules=state.modules.map((module,index)=>module.id===current.id?{...module,status:'completed'}:index===nextIndex?{...module,status:'current'}:module);
    const skills=[current.title,...(current.skills||[])];
    const mastery={...state.mastery,...Object.fromEntries(skills.map(skill=>[skill,Math.max(state.mastery[skill]??0,65)]))};
    update({ completed, modules, mastery, lesson:undefined, lessonTopic:undefined, streak: Math.max(state.streak,1), minutes: state.minutes + (activeLesson?.estimatedMinutes || current.estimatedMinutes) });
    setLesson(undefined);
    setSearchQuery('');
  };
  const tabs: {id:typeof tab;label:string}[]=[{id:'learn',label:'Learn'},{id:'example',label:'Example'},{id:'tryIt',label:'Try it'},{id:'check',label:'Check'}];
  const tabContent = activeLesson ? ({ learn: activeLesson.learn, example: activeLesson.example, tryIt: activeLesson.tryIt, check: activeLesson.checkQuestion }[tab]) : '';
  return <PageFrame><PageHeader eyebrow={`Lesson · ${current?.difficulty || 'Your level'}`} title={activeLesson?.title || topic} subtitle="A short lesson, with a real example and a chance to try the idea yourself."/>
    <div className="content-grid"><section className="panel">
      {generator.isPending ? <Skeleton rows={5}/> : activeLesson ? <><div className="lesson-meta"><Clock3 size={13}/>{activeLesson.estimatedMinutes} min <span>·</span><ModeNote mode={activeLesson.mode}/></div><div className="lesson-tabs" role="tablist" aria-label="Lesson sections">{tabs.map(t=><button role="tab" aria-selected={tab===t.id} className={`lesson-tab ${tab===t.id?'active':''}`} key={t.id} onClick={()=>setTab(t.id)} data-testid={`lesson-tab-${t.id}`}>{t.label}</button>)}</div><div className="copy-block" data-testid={`lesson-content-${tab}`}>{tab==='check'?<><h3 style={{ marginBottom:12 }}>Quick check</h3><p>{activeLesson.checkQuestion}</p><textarea className="textarea" value={checkAnswer} onChange={e=>setCheckAnswer(e.target.value)} placeholder="Write it in your own words…" aria-label="Your answer to the lesson check" data-testid="input-lesson-check"/><div className="callout"><strong>One useful connection</strong><br/>{activeLesson.analogy}</div></>:<><p style={{ whiteSpace:'pre-line' }}>{tabContent}</p>{tab==='example'&&<div className="callout"><strong>Think of it like this</strong><br/>{activeLesson.analogy}</div>}{tab==='tryIt'&&<div className="callout"><strong>Practice prompt</strong><br/>{activeLesson.exercisePrompt}</div>}</>}</div><div className="divider"/><div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><button className="btn btn-secondary" onClick={getLesson}><RefreshCw size={13}/> Regenerate lesson</button><button className="btn" onClick={markComplete} data-testid="button-mark-lesson-complete"><Check size={14}/>{state.completed.includes(current?.id || '')?'Completed':'Mark lesson complete'}</button></div></>:<><EmptyState title="Let’s shape a lesson around you." description="Bhaiya will turn your next roadmap topic into a short, practical lesson." action={generator.isPending?'Working…':'Build my lesson'} onAction={getLesson}/>{generator.isError&&<ErrorMessage retry={getLesson}/>}</>}
      {generator.isError&&activeLesson&&<ErrorMessage retry={getLesson}/>}
    </section><section className="stack"><div className="panel"><div className="eyebrow">Your lesson</div><div className="metric-line"><span>Time to set aside</span><strong>{activeLesson?.estimatedMinutes || current?.estimatedMinutes || 15} min</strong></div><div className="metric-line"><span>Part of your path</span><strong>{state.modules.findIndex(m=>m.id===current?.id)+1} / {state.modules.length}</strong></div><div className="divider"/><Link href="/practice" className="btn btn-navy" style={{width:'100%'}}>Take this into practice <ArrowRight size={14}/></Link></div><div className="panel" style={{background:'#e8ede3'}}><h3>Need another angle?</h3><p className="tiny" style={{lineHeight:1.6,margin:'8px 0 14px'}}>Ask your mentor to explain this with a familiar example.</p><Link href="/tutor" className="btn btn-secondary"><MessageCircle size={14}/> Ask about this lesson</Link></div></section></div>
  </PageFrame>;
}

function PracticePage() {
  const { state, update, searchQuery } = useLearning();
  const selected=state.modules.find(item=>item.title.toLowerCase()===searchQuery.trim().toLowerCase());
  const module = selected || state.modules.find(m=>!state.completed.includes(m.id)) || state.modules[0];
  const [draft,setDraft]=useState('');
  const [feedback,setFeedback]=useState<ExerciseFeedback|null>(null);
  const evaluate=useEvaluateExercise();
  const currentLesson=state.lessonTopic===module?.title?state.lesson:undefined;
  const task=currentLesson?.exercisePrompt || `Write a prompt that helps an AI ${state.profile.goal ? `support your goal of ${state.profile.goal}` : 'explain a difficult idea'} clearly. Include context, the task, and what a useful answer should look like.`;
  const submit=()=>evaluate.mutate({data:{topic:module?.title||'Prompt writing',level:state.profile.level,task,submission:draft.trim()}},{onSuccess:result=>{
    setFeedback(result);
    const mastered = result.mastered && result.score >= 80;
    const nextCompleted = mastered && module ? [...new Set([...state.completed,module.id])] : state.completed;
    const nextIndex = state.modules.findIndex(item=>!nextCompleted.includes(item.id));
    const modules = state.modules.map((item,index)=>item.id===module?.id
      ? {...item,status:mastered?'completed':'needs practice'}
      : mastered && index===nextIndex ? {...item,status:'current'} : item);
    const mastery = {...state.mastery,...Object.fromEntries([module?.title,...(module?.skills||[])].filter((skill):skill is string=>Boolean(skill)).map(skill=>[skill,result.score]))};
    const strengths = mastered && module ? [...new Set([...state.profile.strengths,module.title,...(module.skills||[])])] : state.profile.strengths;
    const gaps = result.score < 60 && module ? [...new Set([...state.profile.gaps,module.title])] : mastered && module ? state.profile.gaps.filter(gap=>gap!==module.title) : state.profile.gaps;
    update({
      modules,completed:nextCompleted,mastery,
      profile:{...state.profile,strengths,gaps},
      lesson:mastered?undefined:state.lesson,
      lessonTopic:mastered?undefined:state.lessonTopic,
      practiceCount:state.practiceCount+1,streak:Math.max(1,state.streak),minutes:state.minutes+8,
    });
  }});
  return <PageFrame><PageHeader eyebrow="Practice studio" title="Let’s put an idea to work." subtitle="Good prompts aren’t magic words. They’re clear instructions with a little context."/>
    <div className="content-grid"><section className="stack"><div className="panel"><div className="lesson-meta"><Target size={13}/> Guided practice · 8 minutes</div><h2 style={{margin:'11px 0 8px'}}>Your challenge</h2><p className="copy-block" style={{marginTop:0}}>{task}</p><label htmlFor="practice-submission" className="field-label" style={{marginTop:18}}>Write your prompt</label><textarea id="practice-submission" className="textarea" style={{minHeight:190}} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Start with what the AI needs to know, then say exactly what you want it to do…" data-testid="input-practice-submission"/><div className="tiny" style={{textAlign:'right',marginTop:6}}>{draft.length} characters</div>{evaluate.isError&&<ErrorMessage retry={submit}/>}<button className="btn" style={{marginTop:14}} onClick={submit} disabled={evaluate.isPending||draft.trim().length<8} data-testid="button-submit-practice">{evaluate.isPending?'Reading your prompt…':'Get thoughtful feedback'}<ArrowRight size={14}/></button></div>
       {feedback&&<div className="panel" data-testid="practice-feedback"><div className="panel-head"><div><div className="eyebrow">A few thoughts</div><h2 style={{marginTop:4}}>{feedback.score>=80?'You’ve got this skill.':'You’re building the right habit.'}</h2></div><span className="trend-number">{feedback.score}<small style={{fontSize:12}}>/100</small></span></div><ModeNote mode={feedback.mode}/><p className="copy-block">{feedback.feedback}</p><div className="badge">{feedback.mastery}</div><div className="divider"/><div className="form-row"><div><h3>What’s working</h3>{feedback.strengths.map(s=><p className="tiny" key={s}>+ {s}</p>)}</div><div><h3>Try next</h3>{feedback.improvements.map(s=><p className="tiny" key={s}>↗ {s}</p>)}</div></div><div className="callout"><strong>Your next step</strong><br/>{feedback.nextStep}</div><p className="tiny">{feedback.score>=80?'Your completed skill is saved and the next roadmap step is ready.':feedback.score<60?'This skill stays at the top of your roadmap for another practice round.':'Your progress is saved; keep practicing to strengthen this skill.'}</p></div>}</section>
      <section className="stack"><div className="panel" style={{background:'#e7ece1'}}><div className="eyebrow">A handy pattern</div><h3 style={{margin:'8px 0'}}>Context → task → shape</h3><p className="tiny" style={{lineHeight:1.8}}>Give the AI context. Say what you need. Describe a useful answer: its format, tone, length, or audience.</p></div><div className="panel"><h3>Practice so far</h3><div className="metric-line"><span>Submissions</span><strong data-testid="text-practice-count">{state.practiceCount}</strong></div><div className="metric-line"><span>Time invested</span><strong>{state.minutes} min</strong></div><Link href="/progress" className="btn btn-secondary" style={{marginTop:6}}>My progress <ArrowRight size={13}/></Link></div></section></div>
  </PageFrame>;
}

type ChatLine={role:'learner'|'bhaiya';text:string;mode?:string};
function TutorPage() {
  const {state,searchQuery}=useLearning();
  const [question,setQuestion]=useState(searchQuery);
  const [lastQuestion,setLastQuestion]=useState('');
  const [messages,setMessages]=useState<ChatLine[]>([{role:'bhaiya',text:'Hey, I’m here. Tell me what feels confusing, or what you’d like to make with AI. We can work it out one step at a time.'}]);
  const tutor=useAskTutor();
  const ask=(questionText:string,includeLearner=true)=>{const q=questionText.trim();if(!q)return;setLastQuestion(q);if(includeLearner)setMessages(prev=>[...prev,{role:'learner',text:q}]);tutor.mutate({data:{question:q,profile:{goal:state.profile.goal||'Learn practical AI',level:state.profile.level,strengths:state.profile.strengths,gaps:state.profile.gaps,currentModule:state.modules.find(m=>!state.completed.includes(m.id))?.title||'Getting started',recentMistakes:[]}}},{onSuccess:response=>setMessages(prev=>[...prev,{role:'bhaiya',text:response.answer,mode:response.mode},{role:'bhaiya',text:`A small challenge: ${response.challenge}`}])});};
  const send=()=>{const q=question.trim();if(!q)return;setQuestion('');ask(q);};
  return <PageFrame><PageHeader eyebrow="Your learning companion" title="Ask AI Bhaiya." subtitle="No need to phrase it perfectly. Start with the bit you’re stuck on."/>
    <div className="content-grid"><section className="panel"><div className="panel-head"><div><div className="eyebrow">A conversation, not a search box</div><h2 style={{marginTop:5}}>Let’s figure it out together.</h2></div><span className="badge"><span style={{width:7,height:7,borderRadius:'50%',background:'#769071'}}/> Here for you</span></div><div className="chat-thread" aria-live="polite" data-testid="tutor-conversation">{messages.map((m,i)=><div key={`${i}-${m.text}`}><div className={`chat-bubble ${m.role==='learner'?'learner':'bhaiya'}`} data-testid={`chat-message-${i}`}>{m.text}</div>{m.mode&&<div style={{marginTop:5,marginLeft:8}}><ModeNote mode={m.mode}/></div>}</div>)}</div>{tutor.isError&&<ErrorMessage retry={()=>ask(lastQuestion,false)}/>}<form className="chat-form" onSubmit={e=>{e.preventDefault();send();}}><input className="input" aria-label="Ask AI Bhaiya a question" placeholder="What would you like to understand?" value={question} onChange={e=>setQuestion(e.target.value)} data-testid="input-tutor-question"/><button className="btn" disabled={tutor.isPending||!question.trim()} data-testid="button-send-tutor">{tutor.isPending?'Thinking…':'Ask'}<ArrowRight size={14}/></button></form></section>
    <section className="stack"><div className="panel" style={{background:'#e7ece1'}}><div className="eyebrow">Your context</div><h3 style={{margin:'8px 0'}}>{state.profile.goal||'A fresh start'}</h3><p className="tiny" style={{lineHeight:1.6}}>I’ll keep your learning goal, current topic and areas you’re working on in mind.</p><div className="tag-list">{state.profile.gaps.map(g=><span className="tag" key={g}>Working on · {g}</span>)}</div></div><div className="panel"><h3>Try asking</h3>{['Can you explain this in simpler words?','Show me an example from everyday life.','What should I practice next?'].map((text,index)=><button className="row-link" style={{width:'100%',textAlign:'left',background:'none',border:0,cursor:'pointer'}} key={text} onClick={()=>setQuestion(text)} data-testid={`button-tutor-suggestion-${index}`}>{text}<ArrowUpRight size={14}/></button>)}</div></section></div>
  </PageFrame>;
}

function TrendsPage() {
  const query=useGetTrends();
  const {state,update}=useLearning();
  const [,navigate]=useLocation();
  const roadmap=useGenerateRoadmap();
  const [selectedTrend,setSelectedTrend]=useState('');
  const addTrend=(topic:string)=>{setSelectedTrend(topic);roadmap.mutate({data:{goal:state.profile.goal||'Learn practical AI skills',level:state.profile.level,dailyTime:state.profile.dailyTime,strengths:state.profile.strengths,gaps:state.profile.gaps,existingRoadmap:state.modules,addTopics:[topic]}},{onSuccess:modules=>{update({modules});navigate('/roadmap');}});};
  const trends=query.data?.trends||[];
  return <PageFrame><PageHeader eyebrow="A window into what’s moving" title="Fresh ideas, worth knowing about." subtitle="A curated pulse on AI tools and skills — with the source and date range in plain sight."/>
    <section className="panel"><div className="panel-head"><div><div className="eyebrow">The last 60 days</div><h2 style={{marginTop:5}}>Recent conversations in AI</h2></div><button className="btn btn-secondary" onClick={()=>query.refetch()} disabled={query.isFetching} data-testid="button-refresh-trends"><RefreshCw size={13}/> Refresh</button></div>
      {query.isLoading?<Skeleton rows={5}/>:query.isError?<ErrorMessage retry={()=>query.refetch()}/>:!trends.length?<EmptyState title="Quiet waters, for now." description="There aren’t any current trend signals in this feed. Check back later — we won’t invent the headlines." action="Refresh" onAction={()=>query.refetch()}/>:<>
        <div className="badge orange"><Clock3 size={12}/>{query.data?.rangeLabel || 'Last 60 days'} <span>·</span> Source: {query.data?.source}</div>
        {trends.map((trend,i)=><article className="trend-card" key={trend.id} data-testid={`trend-${trend.id}`}><div className="trend-number">{String(i+1).padStart(2,'0')}</div><div><div className="lesson-meta">{trend.category} <span>·</span> {trend.difficulty} <span>·</span> {trend.learningTime}</div><h3 style={{margin:'7px 0'}}>{trend.title}</h3><p className="tiny" style={{lineHeight:1.65,margin:'0 0 9px'}}>{trend.summary}</p><div className="tag-list"><span className="tag">{trend.mentions} mentions</span><span className="tag">Signal {trend.score}</span><span className="tag">Related lesson: {trend.relatedLesson}</span></div></div><a className="badge" href={trend.sourceUrl} target="_blank" rel="noreferrer" data-testid={`link-trend-source-${trend.id}`}>Source <ArrowUpRight size={12}/></a></article>)}
        <p className="tiny" style={{marginTop:15}}>Feed source: {trends[0]?.sourceUrl?<a href={trends[0].sourceUrl} target="_blank" rel="noreferrer" style={{textDecoration:'underline'}}>{query.data?.source}</a>:query.data?.source} · Window: {query.data?.rangeLabel} · Updated {query.data?.generatedAt ? new Date(query.data.generatedAt).toLocaleString() : 'when feed was fetched'}</p>
      </>}
    </section>
    <div className="panel section-space" style={{background:'#e7ece1'}}><div className="split-head"><div><div className="eyebrow">Make the signal useful</div><h2 style={{marginTop:5}}>Want to learn one of these?</h2><p className="tiny" style={{marginTop:6}}>Bhaiya can add a topic to your personal learning route.</p></div></div>{trends.length?<div className="choice-group">{trends.slice(0,5).map(t=><button className="choice" key={t.id} onClick={()=>addTrend(t.title)} disabled={roadmap.isPending} data-testid={`button-learn-trend-${t.id}`}>{roadmap.isPending?'Adding…':t.title}<ArrowRight size={12}/></button>)}</div>:<Link href="/roadmap" className="btn btn-secondary">Explore my roadmap <ArrowRight size={13}/></Link>}{roadmap.isError&&<div style={{marginTop:12}}><ErrorMessage retry={()=>{if(selectedTrend)addTrend(selectedTrend);}}/></div>}</div>
  </PageFrame>;
}

function JobsPage() {
  const query=useGetJobs();
  const {state,update,searchQuery,setSearchQuery}=useLearning();
  const [, navigate]=useLocation();
  const [role,setRole]=useState(searchQuery);
  const [roleType,setRoleType]=useState('All roles');
  const [locationFilter,setLocationFilter]=useState('All locations');
  const [filter,setFilter]=useState('All levels');
  const [gapResult,setGapResult]=useState<JobGapResult|null>(null);
  const gap=useGenerateJobGap();
  const jobs=query.data?.jobs||[];
  const filtered=useMemo(()=>jobs.filter(j=>{
    const text=`${j.title} ${j.tags.join(' ')}`.toLowerCase();
    const level=j.experienceLevel.toLowerCase();
    const entryLevel=/(entry|junior|fresher|intern)/.test(level);
    const matchesLevel=filter==='All levels'||((filter==='Fresher / Entry'||filter==='0–2 years')&&entryLevel)||level===filter.toLowerCase();
    const matchesLocation=locationFilter==='All locations'||(locationFilter==='Remote'&&j.remote)||(locationFilter==='India'&&/india/i.test(j.location))||(locationFilter==='International'&&j.remote&&!/india/i.test(j.location));
    const matchesRole=roleType==='All roles'||(roleType==='AI Engineer'&&/(?:\bai\b|\bml\b|machine learning|\bllm\b)/.test(text)&&/engineer|scientist/.test(text))||(roleType==='GenAI / LLM'&&/(?:generative|gen.?ai|\bllm\b|large language)/.test(text))||(roleType==='AI Developer'&&/(?:\bai\b|gen.?ai|\bllm\b)/.test(text)&&/developer|software/.test(text))||(roleType==='AI Agent'&&/agent/.test(text))||(roleType==='Machine Learning'&&/(machine learning|\bml\b)/.test(text))||(roleType==='Software Engineer'&&/(software|front.?end|back.?end|full.?stack|developer|programmer)/.test(text));
    return j.remote&&matchesLevel&&matchesLocation&&matchesRole&&(!role||`${j.title} ${j.company} ${j.tags.join(' ')}`.toLowerCase().includes(role.toLowerCase()));
  }),[jobs,filter,locationFilter,roleType,role]);
  const knownSkills=[...state.profile.strengths,...state.modules.filter(item=>state.completed.includes(item.id)).flatMap(item=>item.skills||[]),...Object.entries(state.mastery).filter(([,score])=>score>=70).map(([skill])=>skill),...state.profile.experience.previousProjects.split(/[,;|]/).map(skill=>skill.trim()).filter(Boolean)];
  const makeGap=(job:Job)=>gap.mutate({data:{role:job.title,userSkills:[...new Set(knownSkills)],requiredSkills:job.tags,goal:state.profile.goal||`Prepare for a ${job.title} role`,level:state.profile.level,dailyTime:state.profile.dailyTime}},{onSuccess:result=>setGapResult(result)});
  const refresh=()=>query.refetch();
  const clearFilters=()=>{setRole('');setSearchQuery('');setFilter('All levels');setRoleType('All roles');setLocationFilter('All locations');};
  return <PageFrame><PageHeader eyebrow={query.data?.demo?'Demo roles — not live vacancies':'Live remote listings'} title="Roles that can guide your learning." subtitle="Browse AI and software roles from the source shown here, then compare their skills with what you know."/>
    <div className="content-grid"><section className="panel"><div className="panel-head"><div><div className="eyebrow">{query.data?.demo?'Demo roles — not live vacancies':'Live remote listings'}</div><h2 style={{marginTop:5}}>A real-world skills map</h2></div><button className="btn btn-secondary" onClick={refresh} disabled={query.isFetching} data-testid="button-refresh-jobs"><RefreshCw size={13}/> Refresh</button></div>
      <div className="job-search-row"><div><label className="field-label" htmlFor="job-search">Search by role, company or skill</label><input id="job-search" className="input" value={role} onChange={e=>{setRole(e.target.value);setSearchQuery(e.target.value);}} placeholder="e.g. LangGraph or Python" data-testid="input-job-search"/></div></div><div className="job-filters"><div><label className="field-label" htmlFor="job-role-filter">Role</label><select id="job-role-filter" className="select" value={roleType} onChange={e=>setRoleType(e.target.value)} data-testid="select-job-role"><option>All roles</option><option>AI Engineer</option><option>GenAI / LLM</option><option>AI Developer</option><option>AI Agent</option><option>Machine Learning</option><option>Software Engineer</option></select></div><div><label className="field-label" htmlFor="job-location-filter">Location</label><select id="job-location-filter" className="select" value={locationFilter} onChange={e=>setLocationFilter(e.target.value)} data-testid="select-job-location"><option>All locations</option><option>Remote</option><option>India</option><option>International</option></select></div><div><label className="field-label" htmlFor="experience-filter">Experience</label><select id="experience-filter" className="select" value={filter} onChange={e=>setFilter(e.target.value)} data-testid="select-job-level"><option>All levels</option><option>Fresher / Entry</option><option>0–2 years</option><option>Mid</option><option>Senior</option></select></div></div>
      {query.isLoading?<Skeleton rows={5}/>:query.isError?<ErrorMessage retry={refresh}/>:!filtered.length?<EmptyState title="No roles match those filters." description={jobs.length?'Try a broader search or a different role, location, or experience level.':'The live role feed did not return listings, so we won’t make any up.'} action={role||filter!=='All levels'||roleType!=='All roles'||locationFilter!=='All locations'?'Clear filters':'Refresh feed'} onAction={()=>role||filter!=='All levels'||roleType!=='All roles'||locationFilter!=='All locations'?clearFilters():refresh()}/>:<>{filtered.map(job=><article className="job-card" key={job.id} data-testid={`job-${job.id}`}><div><h3>{job.title}</h3><p>{job.company} · {job.location} · {job.experienceLevel}{job.postedAt?` · Posted ${new Date(job.postedAt).toLocaleDateString()}`:''}</p><div className="tag-list">{job.tags.map(tag=><span className="tag" key={tag}>{tag}</span>)}</div><div className="tiny" style={{marginTop:8}}>Listing source: {job.source}</div></div><div style={{display:'grid',gap:8,alignContent:'start'}}><button className="btn btn-secondary" onClick={()=>makeGap(job)} disabled={gap.isPending} data-testid={`button-gap-${job.id}`}><Target size={13}/> {gap.isPending?'Comparing…':'Check my skill gap'}</button>{job.applyUrl?<a className="btn" href={job.applyUrl} target="_blank" rel="noreferrer" data-testid={`link-apply-${job.id}`}>View listing <ArrowUpRight size={13}/></a>:<span className="badge orange">{job.source.toLowerCase().includes('demo')?'Demo role · not a live vacancy':'No listing link provided by source'}</span>}</div></article>)}
      <p className="tiny" style={{marginTop:14}}>Source: {query.data?.sourceUrl?<a href={query.data.sourceUrl} target="_blank" rel="noreferrer" style={{textDecoration:'underline'}}>{query.data?.source}</a>:query.data?.source} · Fetched {query.data?.fetchedAt?new Date(query.data.fetchedAt).toLocaleString():'recently'}{query.data?.demo?' · Demo feed (not live listings)':''}</p></>}
      {gap.isError&&<ErrorMessage retry={()=>{const job=filtered[0];if(job)makeGap(job);}}/>}
    </section><section className="stack">{gapResult?<div className="panel" data-testid="job-gap-result"><div className="panel-head"><div><div className="eyebrow">Your role readiness</div><h2 style={{marginTop:5}}>{gapResult.matchPercent}% match</h2></div><ModeNote mode={gapResult.mode}/></div><div className="progress-track"><div className="progress-fill" style={{width:`${Math.max(0,Math.min(100,gapResult.matchPercent))}%`}}/></div><div className="divider"/><h3>Skills you already bring</h3>{gapResult.known.length?gapResult.known.map(s=><span className="badge" key={s} style={{margin:'10px 5px 0 0'}}><Check size={12}/>{s}</span>):<p className="tiny">Your strengths will become clearer as you practice.</p>}<h3 style={{marginTop:18}}>Worth building next</h3>{gapResult.missing.map(s=><span className="badge orange" key={s} style={{margin:'10px 5px 0 0'}}>{s}</span>)}<button className="btn" style={{width:'100%',marginTop:18}} onClick={()=>{update({modules:gapResult.roadmap});navigate('/roadmap');}} data-testid="button-use-gap-roadmap">Use this learning plan <ArrowRight size={14}/></button></div>:<div className="panel" style={{background:'#e7ece1'}}><div className="empty-mark"><BriefcaseBusiness size={20}/></div><h3>Let a role show you what matters.</h3><p className="tiny" style={{lineHeight:1.65,marginTop:8}}>Choose “Check my skill gap” on a listing. We’ll compare its skills to your strengths and suggest a learning plan.</p></div>}<div className="panel"><h3>Keep it grounded</h3><p className="tiny" style={{lineHeight:1.7,marginTop:8}}>Listings come from the feed shown above. A demo source is labeled clearly; check the original posting for current details.</p></div></section></div>
  </PageFrame>;
}

function SearchPage() {
  const {state,searchQuery,setSearchQuery}=useLearning();
  const [,navigate]=useLocation();
  const trendsQuery=useGetTrends();
  const jobsQuery=useGetJobs();
  const query=searchQuery.trim();
  const normalized=query.replace(/^(?:learn|find|search|jobs?|roles?)\s+(?:(?:about|for|with|requiring)\s+)?/i,'').trim().toLowerCase();
  const terms=normalized.split(/[\s,]+/).filter(word=>word.length>1&&!['the','and','for','with','how','what','is','to','me','show','learn','jobs','job','role','roles','about','exercise','exercises','practice','lesson','lessons','skill','skills','search','find'].includes(word));
  const matches=(value:string)=>terms.length?terms.every(word=>value.toLowerCase().includes(word)):value.toLowerCase().includes(query.toLowerCase());
  const moduleResults=state.modules.filter(module=>matches(`${module.title} ${module.description} ${module.skills?.join(' ')||''}`));
  const trends=(trendsQuery.data?.trends||[]).filter(trend=>matches(`${trend.title} ${trend.summary} ${trend.relatedLesson}`));
  const jobs=(jobsQuery.data?.jobs||[]).filter(job=>matches(`${job.title} ${job.company} ${job.tags.join(' ')}`));
  const currentModule=state.modules.find(module=>!state.completed.includes(module.id))||state.modules[0];
  const practiceContext=`${state.lesson?.title||''} ${state.lesson?.exercisePrompt||''} ${currentModule?.title||''} ${(currentModule?.skills||[]).join(' ')}`;
  const showPractice=Boolean(query)&&(/(prompt|practice|exercise|feedback|write)/i.test(query)||matches(practiceContext));
  const tutorPrompt=query.replace(/^(?:ask|explain|teach me)\s+/i,'').trim();
  const openTutor=()=>{setSearchQuery(tutorPrompt||query);navigate('/tutor');};
  return <PageFrame><PageHeader eyebrow="Search your learning space" title={query?`Results for “${query}”`:'Find a useful next step.'} subtitle="Search your roadmap, lessons, current AI topics, practice, or real job listings."/>
    <section className="panel search-results" data-testid="search-results">
      {!query?<EmptyState title="What would you like to learn?" description="Try a skill like RAG, a tool like Claude Code, a practice topic, or a job requirement."/>:<>
        <div className="eyebrow">Your roadmap</div>
        {moduleResults.length?moduleResults.map(module=><button className="search-result" key={module.id} onClick={()=>{setSearchQuery(module.title);navigate('/learn');}} data-testid={`search-module-${module.id}`}><span><strong>{module.title}</strong><small>{module.description}</small></span><span className="badge">Lesson <ArrowRight size={12}/></span></button>):<p className="tiny">No matching roadmap topics yet.</p>}
        <div className="divider"/>
        <div className="eyebrow">Recent AI topics</div>
        {trendsQuery.isLoading?<Skeleton rows={2}/>:trends.length?trends.map(trend=><button className="search-result" key={trend.id} onClick={()=>{setSearchQuery(trend.title);navigate('/trending');}} data-testid={`search-trend-${trend.id}`}><span><strong>{trend.title}</strong><small>{trend.summary}</small></span><span className="badge">Trend <ArrowRight size={12}/></span></button>):<p className="tiny">No matching topics in the current feed.</p>}
        <div className="divider"/>
        <div className="eyebrow">Job listings</div>
        {jobsQuery.isLoading?<Skeleton rows={2}/>:jobs.length?jobs.slice(0,6).map(job=><button className="search-result" key={job.id} onClick={()=>{setSearchQuery(normalized);navigate('/jobs');}} data-testid={`search-job-${job.id}`}><span><strong>{job.title} · {job.company}</strong><small>{job.location} · {job.tags.slice(0,4).join(', ')} · {job.source}</small></span><span className="badge">Role <ArrowRight size={12}/></span></button>):<p className="tiny">No matching live role was found in the current job feed.</p>}
        {showPractice&&<><div className="divider"/><div className="eyebrow">Practice</div><button className="search-result" onClick={()=>navigate('/practice')} data-testid="search-practice"><span><strong>Try a practical exercise</strong><small>Write a response and get feedback tailored to your current learning topic.</small></span><span className="badge">Practice <ArrowRight size={12}/></span></button></>}
        <div className="divider"/>
        <div className="eyebrow">Ask your tutor</div><button className="search-result" onClick={openTutor} data-testid="search-tutor"><span><strong>Ask AI Bhaiya about “{query}”</strong><small>Get an explanation shaped around your learning goal and current level.</small></span><span className="badge">Tutor <ArrowRight size={12}/></span></button>
      </>}
    </section>
  </PageFrame>;
}

function ProgressPage() {
  const {state}=useLearning();
  const total=state.modules.length;
  const percentage=total?Math.round(state.completed.length/total*100):0;
  const skills=[...new Set(state.modules.flatMap(module=>module.skills||[]))];
  return <PageFrame><PageHeader eyebrow="A record of your effort" title="Look how far you’ve come." subtitle="Progress isn’t a race. It’s a set of small ideas you can use with confidence."/>
    <div className="content-grid">
      <section className="stack">
        <div className="panel"><div className="panel-head"><div><div className="eyebrow">Your learning path</div><h2 style={{marginTop:5}}>Momentum, at your pace</h2></div><span className="trend-number">{percentage}%</span></div><div className="progress-track"><div className="progress-fill" style={{width:`${percentage}%`}}/></div><div className="metric-line"><span>Lessons completed</span><strong data-testid="progress-lessons-completed">{state.completed.length} of {total}</strong></div><div className="divider"/>{state.modules.map(module=><div className="row-link" key={module.id} data-testid={`progress-module-${module.id}`}><div><h4>{module.title}</h4><p>{module.estimatedMinutes} minutes · {module.difficulty}</p></div><span className={`badge ${state.completed.includes(module.id)?'':'orange'}`}>{state.completed.includes(module.id)?<><Check size={12}/> Complete</>:'Up next'}</span></div>)}</div>
        <div className="panel" data-testid="progress-skill-mastery"><div className="panel-head"><div><div className="eyebrow">Skill mastery</div><h2 style={{marginTop:5}}>Skills you’re building</h2></div></div>{skills.length?skills.map(skill=>{const score=state.mastery[skill]??0;return <div className="mastery-row" key={skill}><div className="metric-line"><span>{skill}</span><strong>{score?`${score}%`:state.completed.some(id=>state.modules.find(module=>module.id===id)?.skills?.includes(skill))?'65%':'Not assessed'}</strong></div><div className="progress-track"><div className="progress-fill" style={{width:`${score|| (state.completed.some(id=>state.modules.find(module=>module.id===id)?.skills?.includes(skill))?65:0)}%`}}/></div></div>}):<p className="tiny">Your skills will appear here as you follow your roadmap.</p>}</div>
        <div className="panel"><div className="panel-head"><h2>Practice makes it yours</h2><Target size={18} color="#bd6d25"/></div><div className="metric-line"><span>Practice submissions</span><strong data-testid="progress-practice-count">{state.practiceCount}</strong></div><p className="tiny" style={{lineHeight:1.6}}>Each attempt gives you a little more feel for how to work with AI, not just what to memorize.</p><Link href="/practice" className="btn btn-secondary">Practice another prompt <ArrowRight size={13}/></Link></div>
      </section>
      <section className="stack"><div className="panel" style={{background:'#243c3e',color:'#f7f0e4'}}><div className="eyebrow" style={{color:'#edbb76'}}>Your rhythm</div><div style={{font:'700 54px Manrope',letterSpacing:-3,marginTop:10}}>{state.streak}<span style={{fontSize:18,letterSpacing:0,marginLeft:6}}>days</span></div><p style={{fontSize:12,color:'#d0d8cc',lineHeight:1.6}}>A steady return beats a perfect streak. Pick a small moment for learning today.</p><div className="streak-dots">{['M','T','W','T','F','S','S'].map((d,i)=><span className={`streak-dot ${i<state.streak?'done':''}`} key={`${d}-${i}`}>{d}</span>)}</div></div><div className="stat-row" style={{gridTemplateColumns:'1fr 1fr'}}><div className="stat"><strong>{state.minutes}</strong><span>minutes learning</span></div><div className="stat"><strong>{state.completed.length}</strong><span>lessons completed</span></div></div><div className="panel"><h3>Your learning focus</h3><p className="tiny" style={{lineHeight:1.6,marginTop:8}}>{state.profile.goal||'Set a personal learning goal to make your progress more meaningful.'}</p>{state.profile.gaps.length>0&&<div className="tag-list">{state.profile.gaps.map(g=><span className="tag" key={g}>Building · {g}</span>)}</div>}<Link href="/onboarding" className="btn btn-secondary" style={{marginTop:14}}>Tune my learning plan <ArrowRight size={13}/></Link></div></section>
    </div>
  </PageFrame>;
}

function Router() {
  const [location]=useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={HomePage}/><Route path="/onboarding" component={OnboardingPage}/>
    <Route path="/roadmap" component={RoadmapPage}/><Route path="/learn" component={LearnPage}/>
    <Route path="/practice" component={PracticePage}/><Route path="/tutor" component={TutorPage}/>
    <Route path="/trending" component={TrendsPage}/><Route path="/jobs" component={JobsPage}/>
    <Route path="/search" component={SearchPage}/><Route path="/progress" component={ProgressPage}/><Route component={NotFoundPage}/>
  </Switch></ErrorBoundary>;
}
function NotFoundPage(){return <PageFrame><PageHeader eyebrow="A small detour" title="This page isn’t on your path." subtitle="Let’s head back to your learning desk."/><Link href="/" className="btn">Back to learning desk <ArrowRight size={14}/></Link></PageFrame>;}

function App() {
  const [state,setState]=useState<GuestState>(loadGuest);
  const [searchQuery,setSearchQuery]=useState('');
  useEffect(()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch{/* Guest progress remains usable if storage is unavailable. */}},[state]);
  const context=useMemo(()=>({state,update:(patch:Partial<GuestState>)=>setState(current=>({...current,...patch})),searchQuery,setSearchQuery}),[state,searchQuery]);
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><LearningContext.Provider value={context}><Router/></LearningContext.Provider></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;