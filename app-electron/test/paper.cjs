// V3 考试模式回归：解析器、判分、错题 1/3/7 调度、错因概念卡入 FSRS、词库隔离（临时库）
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { Core, parsePaper } = require("../core.cjs");

const MD = `# 原创六级阅读练习卷（测试夹具，无版权）
::meta kind=cet6
## Reading Section A
The city introduced a new repair ordinance. Consumers gained the right to fix their own electronics,
which had previously been blocked by manufacturer restrictions.

### Q1
The word "ordinance" in paragraph 1 is closest in meaning to ___.
- A) ceremony
- B) regulation
- C) product
- D) subsidy
> answer: B
> analysis: ordinance 指法令、条例，与 regulation 近义；ceremony 是仪式，形近干扰。
> point: 词汇题·上下文词义

### Q2
According to the passage, consumers could NOT repair their devices before because ___.
- A) they lacked tools
- B) manufacturers restricted it
- C) parts were too expensive
- D) the devices were safe
> answer: B
> analysis: 首段末句明确说 previously been blocked by manufacturer restrictions。
> point: 细节题·因果定位

### Q3
What is the author's main purpose?
- A) To criticize consumers
- B) To explain a policy change
- C) To advertise electronics
- D) To describe a ceremony
> answer: B
> point: 主旨题
`;

let pass = 0, fail = 0;
const check = (n, c, x) => { console.log(c ? "PASS" : "FAIL", n, x ?? ""); c ? pass++ : fail++; };

const parsed = parsePaper(MD);
check("解析无错误", parsed.errors.length === 0, parsed.errors.join(";"));
check("解析出 1 个 section 3 道题", parsed.sections.length === 1 && parsed.questions.length === 3);
check("Q1 答案与选项解析正确", parsed.questions[0].answer === "B" && parsed.questions[0].options.length === 4);
check("全局题号连续 0/1/2", parsed.questions.map((q) => q.index).join() === "0,1,2");
check("缺答案能报错", parsePaper("## s\n### Q1\nstem\n- A) x\n- B) y").errors.length > 0);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paper-"));
const core = new Core(dir);
const imp = core.importPaper(MD);
check("导入试卷", imp.id > 0 && imp.nQuestions === 3);
const imp2 = core.importPaper(MD);
check("同卷重复导入幂等", imp2.duplicated === true && imp2.id === imp.id);

// 作答：Q1 错选 A，Q2 对，Q3 错选 D
const res = core.gradeAttempt(imp.id, { 0: "A", 1: "B", 2: "D" }, Date.now() - 5 * 60000);
check("判分 1/3 正确", res.correct === 1 && res.total === 3);
let wrong = core.listWrong("active");
check("错题本收 2 题", wrong.length === 2, String(wrong.length));
check("错题初始到期（due，1 天安排但当日列表可见）", wrong.every((w) => w.stage === 0));
check("错题带题干内容", !!wrong[0].question && !!wrong[0].question.stem);

// 错因 → 概念卡
const w0 = wrong.find((w) => w.q_index === 0);
const cc = core.setWrongReason(w0.id, "词汇");
check("概念卡已建", !!cc.concept_card_id);
const due0 = core.getDue(20);
const concept = due0.find((c) => c.card_type === "concept");
check("概念卡进入复习队列（新卡）", !!concept && concept.sentence.includes("【词汇】"), concept?.sentence?.slice(0, 30));
const cc2 = core.setWrongReason(w0.id, "句法");
check("重复标错因不重复建卡（幂等）", cc2.concept_card_id === cc.concept_card_id);
// 概念卡不污染词库/词元统计
check("词库列表不含概念词元", core.listLexemes({}).rows.length === 0);
check("counts 词元为 0、卡片含概念卡", core.counts().total_lexemes === 0 && core.counts().total_cards === 1);

// 1/3/7 调度：模拟时间推进。Q1 第一次重做正确 → stage1（3 天后）
const back = wrong.find((w) => w.q_index === 0);
const r1 = core.redoWrong(back.id, "B");
check("重做正确推进到 stage1", r1.correct && r1.stage === 1 && r1.state === "active");
// 手动把 next_review 拉回到期，再对 → stage2（7 天）
core.user.prepare("UPDATE wrong_questions SET next_review=? WHERE id=?").run(Date.now(), back.id);
const r2 = core.redoWrong(back.id, "B");
check("第二次正确推进到 stage2", r2.stage === 2);
const r3 = core.redoWrong(back.id, "B");
check("第三次正确归档", r3.state === "archived");
check("归档后不在 active 列表", core.listWrong("active").every((w) => w.id !== back.id));
// 做错回退：另一题 stage0 再做错仍 stage0
const w2 = core.listWrong("active").find((w) => w.q_index === 2);
const rb = core.redoWrong(w2.id, "D");
check("重做错误回 stage0", !rb.correct && rb.stage === 0);

// 二次考同一卷：Q1 这次对了、Q3 仍错——已归档的 Q1 不应复活，Q3 保持 active
const res2 = core.gradeAttempt(imp.id, { 0: "B", 1: "B", 2: "A" }, Date.now());
check("第二次判分 2/3", res2.correct === 2);
const q1row = core.user.prepare("SELECT state FROM wrong_questions WHERE paper_id=? AND q_index=0").get(imp.id);
check("答对的归档错题不复活", q1row.state === "archived");

// —— 听力 + 写作主观题 ——
const MD2 = `# 听力与写作混合卷
::meta kind=cet6
## Listening Section A
::kind listening
::audio clip.mp3
[00:03] Now listen to the following conversation.
[00:07] M: I'd like to return this laptop.
[00:11] W: Do you have the receipt?

### Q4
What does the woman ask for?
- A) The receipt
- B) The laptop
- C) The price
- D) The address
> answer: A
> point: 听力细节

## Writing
::kind writing
### Q5
Directions: write a short essay on repair rights (120 words).
> model: Consumers should have the right to repair...
> 范文第二行续行。
`;
const p2 = parsePaper(MD2);
check("混合卷解析无错误", p2.errors.length === 0, p2.errors.join(";"));
const lis = p2.sections.find((s) => s.kind === "listening");
check("听力 section 类型与音频名", !!lis && lis.audio === "clip.mp3");
check("时间轴 cues 解析 3 条", lis.cues.length === 3 && lis.cues[1].t === 7, JSON.stringify(lis.cues.map((c) => c.t)));
check("passage 已去掉时间戳前缀", !/^\[\d\d:/.test(lis.passage.trim()));
const subj = p2.questions.find((q) => q.qtype === "subjective");
check("写作题为主观题且范文含续行", !!subj && subj.model.includes("第二行"), subj?.model);
const imp3 = core.importPaper(MD2);
// 造一个假音频文件验证复制
const fake = path.join(dir, "clip.mp3");
fs.writeFileSync(fake, Buffer.from([1, 2, 3, 4]));
const imp3b = core.importPaper(MD2, [fake]);
check("带音频重复导入走幂等分支不报错", imp3b.duplicated === true);
// 新库场景：删除后重新带音频导入
core.user.prepare("DELETE FROM papers WHERE id=?").run(imp3.id);
const imp4 = core.importPaper(MD2, [fake]);
check("音频复制到 media 且可定位", !!imp4.audio && !!core.mediaPath(imp4.audio), imp4.audio);
const rMix = core.gradeAttempt(imp4.id, { 0: "B", 1: "写了一段作文……" }, Date.now());
check("判分只计客观题（1 题，主观题不计入 total）", rMix.total === 1 && rMix.total_all === 2 && rMix.correct === 0);
const subjDetail = rMix.details.find((d) => !d.graded);
check("主观题 detail 带范文且不判错", subjDetail && subjDetail.correct === null && subjDetail.model.includes("right"));
check("主观题不进错题本", core.listWrong("active").every((w) => w.q_index !== subjDetail.index));

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
