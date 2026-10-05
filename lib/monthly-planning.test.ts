import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node direct TypeScript runner requires the suffix.
import { validMonth, shiftMonth, monthCells, validPriorities, validFeatureWrite, parseMonthlyPlan, shortPostTitle } from './monthly-planning.ts';
const priority = { id: '00000000-0000-4000-8000-000000000001', text: 'Feature autumn menu' };
test('months validate and cross year and leap-day boundaries without local-time shifts', () => {
  for (const month of ['2026-10','2000-01','2100-12']) assert.equal(validMonth(month), true);
  for (const month of ['', '2026-13','2026-00','1999-01','2101-01','2026-10-01',null,{},'2026-1']) assert.equal(validMonth(month), false);
  assert.equal(shiftMonth('2026-12', 1), '2027-01'); assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthCells('2028-02').filter(cell => cell.current).length, 29);
  assert.equal(monthCells('2026-02').filter(cell => cell.current).length, 28);
  assert.equal(monthCells('2026-10')[0].date, '2026-09-28');
});
test('priority shape, bounded text, identifiers and duplicates are validated', () => {
  assert.equal(validPriorities([priority]), true); assert.equal(validPriorities([]), true);
  for (const values of [[priority,priority], [{...priority,text:' '}], [{...priority,text:'x'.repeat(1001)}], [{...priority,id:'bad'}], [{...priority,extra:1}], [{...priority,text:'hello\x01'}], [null], {}]) assert.equal(validPriorities(values), false);
  assert.equal(validPriorities(Array.from({length:20}, (_,index) => ({...priority,id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`}))), true);
  assert.equal(validPriorities(Array.from({length:21}, (_,index) => ({...priority,id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`}))), false);
});
test('every write requires an exact bounded revision and month; unknown owner fields rejected', () => {
  const write = {month:'2026-10', revision:0, priorities:[priority]}; assert.equal(validFeatureWrite(write), true);
  for (const value of [{month:'2026-10', priorities:[]},{...write,revision:null},{...write,revision:-1},{...write,revision:1.5},{...write,revision:2147483647},{...write,user_id:'foreign'}, {...write,month:'2026-13'}]) assert.equal(validFeatureWrite(value), false);
});
test('untrusted or wrong-month responses are rejected instead of blank-overwriting the editor', () => {
  const plan = {month:'2026-10', features:{month:'2026-10',revision:1,priorities:[priority]},entries:[{id:'slot',date:'2026-10-05',title:'Menu',status:'Draft'}],truncated:false};
  assert.deepEqual(parseMonthlyPlan(plan,'2026-10'),plan);
  assert.equal(parseMonthlyPlan(plan,'2026-11'),null); assert.equal(parseMonthlyPlan({...plan,features:{}},'2026-10'),null); assert.equal(parseMonthlyPlan({...plan,entries:[{...plan.entries[0],date:'2026-11-01'}]},'2026-10'),null);
});
test('titles use real purpose or caption without sample content', () => {
  assert.equal(shortPostTitle('Manual draft','Exact caption. More words'),'Exact caption'); assert.equal(shortPostTitle('Menu launch','ignored'),'Menu launch'); assert.equal(shortPostTitle(null,null),'Post');
});
