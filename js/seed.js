// First-run seed: a ready-to-use Push / Pull / Legs program.
// Only the *plan* is seeded (no fake history), so your real log starts clean.
import { uid } from './util.js';

export function buildSeed() {
  const programId = uid();

  const day = (name, muscles) => ({ id: uid(), programId, name, muscles });
  const push = day('Push', 'Petto · Spalle · Tricipiti');
  const pull = day('Pull', 'Schiena · Bicipiti');
  const legs = day('Gambe', 'Quadricipiti · Femorali · Polpacci');

  // planned exercise factory
  let order = 0;
  const ex = (dayId, name, muscle, sets, reps, weight, restSec, kind = 'strength', extra = {}) => ({
    id: uid(), dayId, name, muscle, kind,
    targetSets: sets, targetReps: reps, targetWeight: weight, restSec,
    order: order++, ...extra,
  });

  const planned = [
    // Push
    ex(push.id, 'Panca piana bilanciere', 'Petto', 4, 8, 60, 120),
    ex(push.id, 'Spinte manubri inclinata', 'Petto alto', 3, 10, 22, 90),
    ex(push.id, 'Lento avanti manubri', 'Spalle', 3, 10, 16, 90),
    ex(push.id, 'Alzate laterali', 'Spalle', 3, 15, 8, 60),
    ex(push.id, 'Push down ai cavi', 'Tricipiti', 4, 12, 25, 60),
    ex(push.id, 'French press', 'Tricipiti', 3, 12, 20, 60),
    // Pull
    ex(pull.id, 'Trazioni alla sbarra', 'Schiena', 4, 8, 0, 120),
    ex(pull.id, 'Rematore bilanciere', 'Schiena', 4, 10, 50, 120),
    ex(pull.id, 'Lat machine presa larga', 'Dorsali', 3, 12, 45, 90),
    ex(pull.id, 'Curl bilanciere', 'Bicipiti', 3, 12, 25, 60),
    ex(pull.id, 'Curl a martello', 'Bicipiti', 3, 12, 12, 60),
    ex(pull.id, 'Cyclette defaticamento', 'Cardio', 1, 0, 0, 0, 'cardio', { targetDurationSec: 600 }),
    // Legs
    ex(legs.id, 'Squat bilanciere', 'Quadricipiti', 4, 8, 70, 150),
    ex(legs.id, 'Pressa 45°', 'Quadricipiti', 3, 12, 120, 120),
    ex(legs.id, 'Affondi manubri', 'Gambe', 3, 12, 16, 90),
    ex(legs.id, 'Leg curl', 'Femorali', 3, 12, 35, 90),
    ex(legs.id, 'Calf raise', 'Polpacci', 4, 15, 40, 60),
  ];

  // weekly plan, Monday = 0 ... Sunday = 6 (null = riposo)
  const weekdayPlan = {
    0: push.id, 1: null, 2: pull.id, 3: null, 4: legs.id, 5: null, 6: null,
  };

  const program = { id: programId, name: 'Push / Pull / Gambe', createdAt: Date.now(), weekdayPlan };

  const settings = {
    id: 'app',
    activeProgramId: programId,
    weighIn: { enabled: true, weekday: 0 }, // promemoria peso: lunedì
    theme: 'system',
    accent: 'coral',
    profile: { name: '', goal: '', heightCm: null },
    seededAt: Date.now(),
  };

  return { program, days: [push, pull, legs], planned, settings };
}
