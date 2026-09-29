const { Core } = require('../core.cjs');
const fs = require('fs'), os = require('os'), path = require('path');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'q-'));
const c = new Core(d);
for (const w of ["didn't","won't","can't","don't","isn't","aren't","wasn't","weren't","hasn't","haven't","hadn't","couldn't","wouldn't","shan't","mightn't","it's","you're","they'd","i'm","we've","world's","person's","one's","lockdown","lockdowns","dreamworld","dreamworlds","conceiver","conceivers","rica","ricas","nida","nidas"]) {
  const r = c.resolve(w, 'word', null);
  console.log(w, '=>', r ? r.lemma : 'NULL');
}
c.user.close();
fs.rmSync(d, { recursive: true, force: true });
