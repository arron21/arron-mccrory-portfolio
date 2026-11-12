import type { MmoCard, ElementType } from '../types.ts';

export interface SynergyBonus {
  id: string;
  name: string;
  description: string;
  tier: 'gold' | 'silver' | 'chromatic';
}

export interface CombatUnitState {
  instanceId: string;
  cardId: string;
  side: 'player' | 'enemy';
  slotIndex: number;
  title: string;
  epithet: string;
  imageUrl: string;
  element: ElementType;
  role: string;
  rarity: string;
  foil: string;
  opticalTrait: string;
  secondaryTrait?: string;
  abilityName: string;
  abilityEffect: string;
  maxHp: number;
  hp: number;
  shield: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  actionCount: number;
  totalDamageDealt: number;
  totalHealingDone: number;
  alive: boolean;
}

export interface BattleStep {
  stepIndex: number;
  round: number;
  actorInstanceId: string;
  targetInstanceId?: string;
  side: 'player' | 'enemy';
  type: 'start' | 'attack' | 'ability' | 'counter' | 'ko' | 'end';
  title: string;
  logText: string;
  damage?: number;
  heal?: number;
  shieldGain?: number;
  isCrit?: boolean;
  elementAdvantage?: boolean;
  playerUnits: CombatUnitState[];
  enemyUnits: CombatUnitState[];
}

export interface AutoBattleSimulation {
  opponentName: string;
  opponentTitle: string;
  isRaidBoss: boolean;
  playerSynergies: SynergyBonus[];
  enemySynergies: SynergyBonus[];
  steps: BattleStep[];
  won: boolean;
  totalDamageDealt: number;
  mvpCardId: string;
}

const ELEMENT_COUNTERS: Record<ElementType, ElementType> = {
  Solar: 'Monochrome',
  Monochrome: 'Astral',
  Astral: 'Abyssal',
  Abyssal: 'Crimson',
  Crimson: 'Verdant',
  Verdant: 'Solar',
};

export function evaluateSquadSynergies(cards: MmoCard[]): SynergyBonus[] {
  const bonuses: SynergyBonus[] = [];
  if (cards.length === 0) return bonuses;

  const elemCounts: Partial<Record<ElementType, number>> = {};
  for (const c of cards) {
    elemCounts[c.element] = (elemCounts[c.element] || 0) + 1;
  }

  const uniqueElements = Object.keys(elemCounts).length;
  if (uniqueElements >= 4) {
    bonuses.push({
      id: 'syn-prismatic-quartet',
      name: 'Prismatic Quartet (4 Elements)',
      description: '+18% All Stats & +12% Crit Chance to entire squad',
      tier: 'chromatic',
    });
  }

  for (const [elem, count] of Object.entries(elemCounts)) {
    if ((count || 0) >= 3) {
      bonuses.push({
        id: `syn-${elem}-3`,
        name: `Ascendant ${elem} Triad (${count})`,
        description: `+28% ATK, +25% Max HP & +12 SPD to ${elem} plates`,
        tier: 'gold',
      });
    } else if ((count || 0) === 2) {
      bonuses.push({
        id: `syn-${elem}-2`,
        name: `${elem} Resonance (2)`,
        description: `+15% ATK & +15% Max HP to ${elem} plates`,
        tier: 'silver',
      });
    }
  }

  // Photography Category Synergies
  const catCounts: Record<string, number> = {};
  for (const c of cards) {
    if (c.category) {
      catCounts[c.category] = (catCounts[c.category] || 0) + 1;
    }
  }
  const uniqueCategories = Object.keys(catCounts).length;
  if (uniqueCategories >= 3) {
    bonuses.push({
      id: 'syn-curator-exhibition',
      name: `Curator's Exhibition (${uniqueCategories} Genres)`,
      description: '+10% All Stats for combining 3+ Photography Categories',
      tier: 'chromatic',
    });
  }
  for (const [cat, count] of Object.entries(catCounts)) {
    if (count >= 2) {
      bonuses.push({
        id: `syn-cat-${cat}`,
        name: `${cat} Series (${count})`,
        description:
          cat === 'Architecture'
            ? '+20% DEF & +14% Structural Shield to squad'
            : cat === 'Portrait'
            ? '+12% Crit Chance & +14% ATK to squad'
            : cat === 'Nature'
            ? '+18% Max HP to squad'
            : cat === 'Still Life'
            ? '+15% ATK & +15% DEF to squad'
            : `+15% ATK & +10 SPD (${cat} Resonance)`,
        tier: 'gold',
      });
    }
  }

  // Slot 1 Frontline Vanguard bonus
  if (cards[0]?.role === 'Vanguard' || cards[0]?.role === 'Bruiser') {
    bonuses.push({
      id: 'syn-frontline-bastion',
      name: 'Lead Vanguard Formation',
      description: 'Slot 1 starts with a 22% Max HP Optical Barrier',
      tier: 'gold',
    });
  }

  // Optical trait synergy
  const totalHype = cards.reduce((sum, c) => sum + (c.hypeCount || 0), 0);
  if (totalHype >= 10) {
    const hypeBoost = Math.min(30, Math.round(totalHype * 0.8));
    bonuses.push({
      id: 'syn-social-hype',
      name: `Chromastream Hype (${totalHype} ⚡)`,
      description: `+${hypeBoost}% Squad HP & ATK from Social Feed Hype`,
      tier: 'chromatic',
    });
  }

  return bonuses;
}

function cloneUnits(units: CombatUnitState[]): CombatUnitState[] {
  return units.map((u) => ({ ...u }));
}

function buildCombatUnits(
  cards: MmoCard[],
  side: 'player' | 'enemy',
  synergies: SynergyBonus[]
): CombatUnitState[] {
  const hasPrismatic = synergies.some((s) => s.id === 'syn-prismatic-quartet');
  const hasCurator = synergies.some((s) => s.id === 'syn-curator-exhibition');
  const totalHype = cards.reduce((sum, c) => sum + (c.hypeCount || 0), 0);
  const hypeMult = 1 + Math.min(0.3, totalHype * 0.004);

  return cards.map((card, idx) => {
    const elemTriad = synergies.some((s) => s.id === `syn-${card.element}-3`);
    const elemPair = synergies.some((s) => s.id === `syn-${card.element}-2`);
    const catPair = card.category
      ? synergies.some((s) => s.id === `syn-cat-${card.category}`)
      : false;

    let hpMult = hypeMult * (hasPrismatic ? 1.18 : 1) * (hasCurator ? 1.1 : 1);
    let atkMult = hypeMult * (hasPrismatic ? 1.18 : 1) * (hasCurator ? 1.1 : 1);
    let defMult = hasCurator ? 1.1 : 1;
    let spdBonus = (hasPrismatic ? 8 : 0) + (hasCurator ? 6 : 0);
    let critBonus = (hasPrismatic ? 12 : 0) + (hasCurator ? 5 : 0);

    if (elemTriad) {
      hpMult *= 1.25;
      atkMult *= 1.28;
      spdBonus += 12;
    } else if (elemPair) {
      hpMult *= 1.15;
      atkMult *= 1.15;
    }

    if (catPair) {
      if (card.category === 'Architecture') defMult *= 1.2;
      else if (card.category === 'Portrait') {
        atkMult *= 1.14;
        critBonus += 12;
      } else if (card.category === 'Nature') hpMult *= 1.18;
      else if (card.category === 'Still Life') {
        atkMult *= 1.15;
        defMult *= 1.15;
      } else {
        atkMult *= 1.15;
        spdBonus += 10;
      }
    }

    if (card.category === 'Street & Action') {
      spdBonus += 10;
    }

    const maxHp = Math.round(card.hp * hpMult);
    const startingShield =
      idx === 0 && (card.role === 'Vanguard' || card.role === 'Bruiser')
        ? Math.round(maxHp * 0.22)
        : card.category === 'Architecture'
        ? Math.round(maxHp * 0.16)
        : card.opticalTrait === 'Long-Exposure Bastion'
        ? Math.round(maxHp * 0.15)
        : 0;

    return {
      instanceId: `${side}-${idx}-${card.id}`,
      cardId: card.id,
      side,
      slotIndex: idx,
      title: card.title,
      epithet: card.epithet,
      imageUrl: card.imageUrl,
      element: card.element,
      role: card.role,
      rarity: card.rarity,
      foil: card.foil,
      opticalTrait: card.opticalTrait,
      secondaryTrait: card.secondaryTrait,
      abilityName: card.ability.name,
      abilityEffect: card.ability.effectType,
      maxHp,
      hp: maxHp,
      shield: startingShield,
      atk: Math.round(card.atk * atkMult),
      def: Math.round(card.def * defMult),
      spd: card.spd + spdBonus,
      crit: Math.min(75, card.crit + critBonus),
      actionCount: 0,
      totalDamageDealt: 0,
      totalHealingDone: startingShield,
      alive: true,
    };
  });
}

function applyDamageToUnit(target: CombatUnitState, rawDmg: number): number {
  const actualDmg = Math.max(15, Math.round(rawDmg));
  let remaining = actualDmg;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp = Math.max(0, target.hp - remaining);
  if (target.hp === 0) {
    target.alive = false;
  }
  return actualDmg;
}

export function simulateAutoBattle(
  playerCards: MmoCard[],
  enemyCards: MmoCard[],
  opponentName: string,
  opponentTitle: string,
  isRaidBoss = false
): AutoBattleSimulation {
  const playerSynergies = evaluateSquadSynergies(playerCards);
  const enemySynergies = evaluateSquadSynergies(enemyCards);

  const playerUnits = buildCombatUnits(playerCards, 'player', playerSynergies);
  const enemyUnits = buildCombatUnits(enemyCards, 'enemy', enemySynergies);

  const steps: BattleStep[] = [];
  let stepIndex = 0;

  // Step 0: Battle Start & Synergy Activation
  steps.push({
    stepIndex: stepIndex++,
    round: 1,
    actorInstanceId: playerUnits[0]?.instanceId || 'player-0',
    side: 'player',
    type: 'start',
    title: 'Auto-Battle Initialized',
    logText: `Squads locked in formation! ${playerSynergies.length} active player synergies engaged against ${opponentName}.`,
    playerUnits: cloneUnits(playerUnits),
    enemyUnits: cloneUnits(enemyUnits),
  });

  // Deterministic pseudo-random generator seeded by squad stats so replays are consistent
  let seed =
    playerUnits.reduce((acc, u) => acc + u.maxHp + u.atk + u.spd, 0) +
    enemyUnits.reduce((acc, u) => acc + u.maxHp + u.atk, 0) +
    Date.now();
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const MAX_ROUNDS = isRaidBoss ? 10 : 12;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const allLiving = [...playerUnits, ...enemyUnits]
      .filter((u) => u.alive)
      .sort((a, b) => b.spd - a.spd || a.slotIndex - b.slotIndex);

    for (const actor of allLiving) {
      if (!actor.alive) continue;

      const allies = actor.side === 'player' ? playerUnits : enemyUnits;
      const enemies = (actor.side === 'player' ? enemyUnits : playerUnits).filter(
        (u) => u.alive
      );

      if (enemies.length === 0) break;

      actor.actionCount += 1;

      // Target selection: Arcanists/Strikers have a chance to snipe backline; otherwise hit frontline
      let target = enemies[0];
      if (
        (actor.role === 'Arcanist' || actor.abilityEffect === 'chain_crit') &&
        enemies.length > 1 &&
        actor.actionCount % 2 === 0
      ) {
        target = enemies[enemies.length - 1];
      }

      const isAdvantage = ELEMENT_COUNTERS[actor.element] === target.element;
      const elemMult = isAdvantage ? 1.25 : 1.0;
      const isCrit = nextRand() * 100 < actor.crit;
      const critMult = isCrit ? 1.55 : 1.0;

      const triggerAbility =
        actor.actionCount % 2 === 0 || (isCrit && actor.abilityEffect === 'lifesteal_exec');

      const defReduction =
        actor.abilityEffect === 'true_counter' && triggerAbility
          ? 1.0
          : 100 / (100 + Math.max(0, target.def));

      const baseScale = triggerAbility ? 1.42 : 1.0;
      const rawDmg = actor.atk * baseScale * elemMult * critMult * defReduction * (0.94 + nextRand() * 0.12);
      const dealt = applyDamageToUnit(target, rawDmg);
      actor.totalDamageDealt += dealt;

      let healAmt = 0;
      let shieldAmt = 0;
      let extraLog = '';

      if (triggerAbility) {
        if (actor.abilityEffect === 'aoe_burn') {
          // Splash to secondary enemy + shield allies
          if (enemies.length > 1) {
            const splashTarget = enemies[1];
            const splashDmg = applyDamageToUnit(splashTarget, rawDmg * 0.45);
            actor.totalDamageDealt += splashDmg;
            extraLog += ` +${splashDmg} Solar splash to ${splashTarget.title}!`;
          }
          for (const ally of allies.filter((a) => a.alive)) {
            const s = Math.round(ally.maxHp * 0.1);
            ally.shield += s;
            shieldAmt += s;
          }
          actor.totalHealingDone += shieldAmt;
          extraLog += ` Granted Radiant Shields to squad!`;
        } else if (actor.abilityEffect === 'armor_shred_heal') {
          target.def = Math.max(10, Math.round(target.def * 0.75));
          healAmt = Math.min(actor.maxHp - actor.hp, Math.round(actor.maxHp * 0.18));
          actor.hp += healAmt;
          actor.totalHealingDone += healAmt;
          extraLog += ` Shredded ${target.title}'s DEF & healed ${healAmt} HP!`;
        } else if (actor.abilityEffect === 'lifesteal_exec') {
          healAmt = Math.min(actor.maxHp - actor.hp, Math.round(dealt * 0.45));
          actor.hp += healAmt;
          actor.totalHealingDone += healAmt;
          extraLog += ` Drained ${healAmt} Crimson Life!`;
        } else if (actor.abilityEffect === 'team_heal_thorns') {
          const mostInjured = [...allies]
            .filter((a) => a.alive)
            .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (mostInjured) {
            healAmt = Math.min(
              mostInjured.maxHp - mostInjured.hp,
              Math.round(mostInjured.maxHp * 0.24)
            );
            mostInjured.hp += healAmt;
            actor.totalHealingDone += healAmt;
            extraLog += ` Restored ${healAmt} HP to ${mostInjured.title}!`;
          }
        } else if (actor.abilityEffect === 'chain_crit') {
          for (const ally of allies.filter((a) => a.alive)) {
            ally.crit = Math.min(85, ally.crit + 8);
          }
          extraLog += ` Boosted squad Crit Chance by +8%!`;
        } else if (actor.abilityEffect === 'true_counter') {
          target.spd = Math.max(50, target.spd - 8);
          actor.spd += 8;
          extraLog += ` Bypassed DEF (True Damage) & stole 8 SPD!`;
        }
      }

      const actionTitle = triggerAbility ? actor.abilityName : 'Optical Strike';
      const critTag = isCrit ? ' [CRIT!]' : '';
      const advTag = isAdvantage ? ' [ELEMENTAL ADVANTAGE!]' : '';

      steps.push({
        stepIndex: stepIndex++,
        round,
        actorInstanceId: actor.instanceId,
        targetInstanceId: target.instanceId,
        side: actor.side,
        type: triggerAbility ? 'ability' : 'attack',
        title: actionTitle,
        logText: `${actor.title} used ${actionTitle} on ${target.title} for ${dealt} dmg${critTag}${advTag}.${extraLog}`,
        damage: dealt,
        heal: healAmt > 0 ? healAmt : undefined,
        shieldGain: shieldAmt > 0 ? shieldAmt : undefined,
        isCrit,
        elementAdvantage: isAdvantage,
        playerUnits: cloneUnits(playerUnits),
        enemyUnits: cloneUnits(enemyUnits),
      });

      if (!target.alive) {
        steps.push({
          stepIndex: stepIndex++,
          round,
          actorInstanceId: actor.instanceId,
          targetInstanceId: target.instanceId,
          side: actor.side,
          type: 'ko',
          title: 'Plate Shattered!',
          logText: `${target.title} was shattered by ${actor.title}!`,
          playerUnits: cloneUnits(playerUnits),
          enemyUnits: cloneUnits(enemyUnits),
        });
      }

      const playerAlive = playerUnits.some((u) => u.alive);
      const enemyAlive = enemyUnits.some((u) => u.alive);
      if (!playerAlive || !enemyAlive) break;
    }

    const playerAlive = playerUnits.some((u) => u.alive);
    const enemyAlive = enemyUnits.some((u) => u.alive);
    if (!playerAlive || !enemyAlive) break;
  }

  const playerRemainingHp = playerUnits.reduce((s, u) => s + u.hp, 0);
  const enemyRemainingHp = enemyUnits.reduce((s, u) => s + u.hp, 0);
  const won = isRaidBoss
    ? true // Raid strikes always succeed and record total boss damage dealt!
    : enemyRemainingHp === 0 || playerRemainingHp >= enemyRemainingHp;

  const totalDamageDealt = playerUnits.reduce((s, u) => s + u.totalDamageDealt, 0);
  const mvpUnit = [...playerUnits].sort(
    (a, b) =>
      b.totalDamageDealt + b.totalHealingDone - (a.totalDamageDealt + a.totalHealingDone)
  )[0];

  steps.push({
    stepIndex: stepIndex++,
    round: MAX_ROUNDS,
    actorInstanceId: mvpUnit?.instanceId || playerUnits[0]?.instanceId || 'player-0',
    side: won ? 'player' : 'enemy',
    type: 'end',
    title: isRaidBoss
      ? `Raid Strike Complete · ${totalDamageDealt.toLocaleString()} Boss Damage!`
      : won
      ? 'Victory in the Chromarift!'
      : 'Squad Defeated',
    logText: isRaidBoss
      ? `Your squad inflicted ${totalDamageDealt.toLocaleString()} total damage against ${opponentName}!`
      : won
      ? `Your squad triumphed over ${opponentName}! MVP: ${mvpUnit?.title || 'Lead Plate'}.`
      : `${opponentName}'s formation held the line.`,
    playerUnits: cloneUnits(playerUnits),
    enemyUnits: cloneUnits(enemyUnits),
  });

  return {
    opponentName,
    opponentTitle,
    isRaidBoss,
    playerSynergies,
    enemySynergies,
    steps,
    won,
    totalDamageDealt,
    mvpCardId: mvpUnit?.cardId || playerCards[0]?.id || '',
  };
}
