// 发布核心的回归：写库/登记/覆盖/模式切换清孤儿/加密往返。
// 用临时目录当项目根，不碰真实 public/banks。
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishBankToRepo, readBankManifest } from '../src/server/publish-bank-core.js';
import { decryptQuestionBankPayload } from '../src/lib/qbpack.js';

const questions = [
  { id: 'q-1', question: 'Pick one?', choices: ['a', 'b'], answer: 0, source: 'S – Q1' },
  { id: 'q-2', question: 'Bad record', choices: ['only-one'], answer: 0 }, // 会被校验剔除
];

let root;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'qb-pub-'));
  mkdirSync(path.join(root, 'public/banks'), { recursive: true });
  writeFileSync(path.join(root, 'public/banks/index.json'), '[]\n');
});

describe('publishBankToRepo', () => {
  it('公开发布：写 json + 登记 manifest，剔除不合格记录', async () => {
    const r = await publishBankToRepo({ root, questions, id: 'My Bank!', title: 'My Bank' });
    expect(r.id).toBe('my-bank'); // slug 化
    expect(r.count).toBe(1);
    expect(r.rejectedCount).toBe(1);
    const written = JSON.parse(readFileSync(path.join(root, 'public/banks/my-bank.json'), 'utf8'));
    expect(written.length).toBe(1);
    const manifest = readBankManifest(root);
    expect(manifest).toEqual([
      expect.objectContaining({ id: 'my-bank', mode: 'public', question_count: 1, json: 'banks/my-bank.json' }),
    ]);
  });

  it('同 id 转加密重发：qbpack 可用原密码解密回原题，旧 .json 孤儿被清理', async () => {
    await publishBankToRepo({ root, questions, id: 'my-bank', title: 'My Bank' });
    const r2 = await publishBankToRepo({ root, questions, id: 'my-bank', title: 'My Bank', mode: 'protected', password: 'pw-1' });
    expect(r2.replaced).toBe(true);
    expect(r2.removedOld).toBe('banks/my-bank.json');
    expect(existsSync(path.join(root, 'public/banks/my-bank.json'))).toBe(false);
    const envelope = readFileSync(path.join(root, 'public/banks/my-bank.qbpack'), 'utf8');
    const back = await decryptQuestionBankPayload(envelope, 'pw-1');
    expect(back.length).toBe(1);
    expect(back[0].id).toBe('q-1');
    expect(readBankManifest(root)[0]).toEqual(
      expect.objectContaining({ id: 'my-bank', mode: 'protected', payload: 'banks/my-bank.qbpack' }),
    );
  });

  it('保护模式缺密码 / 全部题不合格 → 报错不落盘', async () => {
    await expect(publishBankToRepo({ root, questions, id: 'x', mode: 'protected' })).rejects.toThrow('密码');
    await expect(publishBankToRepo({ root, questions: [questions[1]], id: 'x' })).rejects.toThrow('有效题目');
    expect(readBankManifest(root)).toEqual([]);
  });
});

describe('removeBankFromRepo / convertBankInRepo', () => {
  it('删除 = 登记移除 + 数据文件移入 .bank-trash/（可找回，不再真删）', async () => {
    await publishBankToRepo({ root, questions, id: 'trash-me', title: 'T' });
    const { removeBankFromRepo } = await import('../src/server/publish-bank-core.js');
    const r = removeBankFromRepo({ root, id: 'trash-me', mode: 'delete' });
    expect(r.trashedTo).toMatch(/^\.bank-trash\/.*trash-me\.json$/);
    expect(existsSync(path.join(root, 'public/banks/trash-me.json'))).toBe(false);
    expect(existsSync(path.join(root, r.trashedTo))).toBe(true); // 回收目录里能找回
    const back = JSON.parse(readFileSync(path.join(root, r.trashedTo), 'utf8'));
    expect(back[0].id).toBe('q-1');
    expect(readBankManifest(root)).toEqual([]);
  });

  it('下架/恢复：deploy 标记往返', async () => {
    await publishBankToRepo({ root, questions, id: 'flip', title: 'F' });
    const { removeBankFromRepo } = await import('../src/server/publish-bank-core.js');
    removeBankFromRepo({ root, id: 'flip', mode: 'unlist' });
    expect(readBankManifest(root)[0].deploy).toBe(false);
    removeBankFromRepo({ root, id: 'flip', mode: 'restore' });
    expect('deploy' in readBankManifest(root)[0]).toBe(false);
  });

  it('convert 双向：加密往返内容一致，错密码拒绝', async () => {
    await publishBankToRepo({ root, questions, id: 'cv', title: 'C' });
    const { convertBankInRepo } = await import('../src/server/publish-bank-core.js');
    await convertBankInRepo({ root, id: 'cv', newPassword: 'p1' });
    expect(readBankManifest(root)[0].mode).toBe('protected');
    await expect(convertBankInRepo({ root, id: 'cv', password: 'WRONG' })).rejects.toThrow('密码');
    const r = await convertBankInRepo({ root, id: 'cv', password: 'p1' });
    expect(r.toProtected).toBe(false);
    const back = JSON.parse(readFileSync(path.join(root, 'public/banks/cv.json'), 'utf8'));
    expect(back[0].id).toBe('q-1');
  });
});

describe('moveBankInRepo（目录顺序）', () => {
  it('上移/下移交换清单相邻位置，边界处原样不动', async () => {
    const { moveBankFromRepo } = {};
    const { moveBankInRepo } = await import('../src/server/publish-bank-core.js');
    await publishBankToRepo({ root, questions, id: 'a', title: 'A' });
    await publishBankToRepo({ root, questions, id: 'b', title: 'B' });
    await publishBankToRepo({ root, questions, id: 'c', title: 'C' });
    expect(readBankManifest(root).map((e) => e.id)).toEqual(['a', 'b', 'c']);

    expect(moveBankInRepo({ root, id: 'c', delta: -1 }).moved).toBe(true);
    expect(readBankManifest(root).map((e) => e.id)).toEqual(['a', 'c', 'b']);

    expect(moveBankInRepo({ root, id: 'a', delta: -1 }).moved).toBe(false); // 顶部上移不动
    expect(moveBankInRepo({ root, id: 'b', delta: 1 }).moved).toBe(false); // 底部下移不动
    expect(readBankManifest(root).map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });
});
