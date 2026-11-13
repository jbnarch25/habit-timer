import { describe, expect, it } from 'vitest';
import type { Task } from '../src/lib/model';
import { findByName, fuzzyScore, matchTasks, normalizeName } from '../src/lib/tasks/nameMatch';

const task = (name: string, archived = false): Task => ({ id: name, name, taskAlert: false, archived, createdAt: 0 });

describe('task names', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeName('  Wash   the Dishes ')).toBe('wash the dishes');
    expect(findByName([task('Wash the dishes')], ' wash  THE dishes')?.name).toBe('Wash the dishes');
    expect(findByName([task('Dishes')], '   ')).toBeUndefined();
  });

  it('fuzzy ranks exact, prefix, word, substring, subsequence', () => {
    expect(fuzzyScore('dishes', 'Dishes')).toBe(0);
    expect(fuzzyScore('dish', 'Dishes')).toBe(1);
    expect(fuzzyScore('dish', 'Wash dishes')).toBe(2);
    expect(fuzzyScore('ash', 'Wash dishes')).toBe(3);
    expect(fuzzyScore('wsh', 'Wash dishes')).toBeGreaterThan(3);
    expect(fuzzyScore('xyz', 'Wash dishes')).toBeNull();
  });

  it('archived matches come last', () => {
    const tasks = [task('Dishes', true), task('Laundry dishes'), task('Vacuum')];
    expect(matchTasks(tasks, 'dish').map((t) => t.name)).toEqual(['Laundry dishes', 'Dishes']);
  });
});
