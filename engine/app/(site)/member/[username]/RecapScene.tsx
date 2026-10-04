'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { RecapCard } from '@/lib/recap/cards';
import { splitForOdometer } from '@/lib/recap/odometer';
import type { RecapStats } from '@/lib/recap/types';
import { Pfp } from '../../components/Avatars';

const safeCount = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const fmt = (value: unknown) => safeCount(value).toLocaleString('en-US');
const cap = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

export function approvalLabel(score: number): string {
  if (score >= 85) return 'Groupchat Classic';
  if (score >= 70) return 'Fan Favorite';
  if (score >= 50) return 'Cult Favorite';
  return 'A Complicated Watch';
}

function BigText({ card }: { card: RecapCard }) {
  if (card.key === 'airtime' || card.key === 'approval') {
    const parts = splitForOdometer(card.big);
    let digitIdx = 0;
    return (
      <p className="big">
        {parts.map((part, index) => part.kind === 'text'
          ? <span key={index}>{part.value}</span>
          : (
            <span className="flx-odo-digit" key={index}
              style={{ '--odo-n': part.value, '--odo-i': digitIdx++ } as CSSProperties}>
              <span className="flx-odo-strip" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => <span key={digit}>{digit}</span>)}
              </span>
            </span>
          ))}
      </p>
    );
  }
  if (card.key === 'intro') {
    return <p className="big">{card.big}</p>;
  }
  return <p className="big">{card.big}</p>;
}

function Tiles({ count = 9, className = '' }: { count?: number; className?: string }) {
  return <div className={`flx-recap-tiles ${className}`} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <i key={index} style={{ '--tile': index } as CSSProperties} />)}
  </div>;
}

function Clock({ hour }: { hour: number }) {
  const normalized = cap(hour, 23);
  return (
    <div className="flx-recap-clock" aria-hidden="true" style={{ '--clock-angle': `${normalized * 15}deg` } as CSSProperties}>
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" />
        {Array.from({ length: 12 }, (_, index) => (
          <line key={index} x1="60" y1="12" x2="60" y2="19" transform={`rotate(${index * 30} 60 60)`} />
        ))}
        <line className="hand" x1="60" y1="60" x2="60" y2="22" />
        <circle className="pin" cx="60" cy="60" r="4" />
      </svg>
    </div>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function FinaleCalendar({ date }: { date: string }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const winner = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || winner < 1 || winner > 31) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (winner > days) return null;
  const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const monthName = MONTHS[month - 1]!;
  return (
    <div className="flx-recap-calendar" aria-hidden="true">
      <b>{monthName} {year}</b>
      {WEEKDAYS.map((weekday, index) => <span className="weekday" key={`${weekday}-${index}`}>{weekday}</span>)}
      {Array.from({ length: offset }, (_, index) => <span className="blank" key={`blank-${index}`} />)}
      {Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        return <i key={day} className={day === winner ? 'winner' : ''} style={{ '--tile': index } as CSSProperties}>{day}</i>;
      })}
      <strong>SEASON FINALE · {monthName.toUpperCase()} {winner}</strong>
    </div>
  );
}

function CategoryAnimation({ card, stats, username, displayName, names }: {
  card: RecapCard;
  stats: RecapStats;
  username: string;
  displayName: string;
  names: Record<string, string>;
}) {
  const r = stats.reactions;
  switch (card.key) {
    case 'intro':
      return <div className="flx-recap-title-art" aria-hidden="true"><Pfp name={username} size={116} /><span>NETFLIXIA ORIGINAL</span><b>Skip Intro</b></div>;
    case 'airtime':
      return <Tiles count={9} className="episodes" />;
    case 'busiest-day':
      return stats.airtime.busiestDay ? <FinaleCalendar date={stats.airtime.busiestDay.date} /> : null;
    case 'clock':
      return <Clock hour={stats.airtime.peakHour} />;
    case 'streak': {
      const lit = cap(stats.airtime.longestStreakDays, 10);
      return <div className="flx-recap-filmstrip" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => <i key={index} className={index < lit ? 'lit' : index >= 7 ? 'hiatus' : ''} />)}
        {stats.airtime.longestGapDays > 0 && <span>MIDSEASON HIATUS · {fmt(stats.airtime.longestGapDays)} DAYS</span>}
      </div>;
    }
    case 'binge':
      return <div className="flx-recap-binge" aria-hidden="true"><strong>Are you still watching?</strong><Tiles count={12} /></div>;
    case 'reaction-economy': {
      const balance = r.given === r.received ? 'Even split' : r.given > r.received ? 'More given' : 'More received';
      return <div className="flx-recap-economy" aria-label={`${fmt(r.given)} reactions given and ${fmt(r.received)} received. ${balance}.`}>
        <span><b>{fmt(r.given)}</b><small>Given</small></span><i aria-hidden="true">⇄</i><span><b>{fmt(r.received)}</b><small>Received</small></span>
        <div className="tokens" aria-hidden="true">{['❤️', '😂', '🔥', '💀', '👍', '😭'].map((emoji, i) => <em key={i}>{emoji}</em>)}</div>
      </div>;
    }
    case 'emoji':
      return <div className="flx-recap-emojis" aria-label="Emoji highlights">
        <span><b>{r.topGivenEmoji?.name || '—'}</b><small>Most used · {fmt(r.topGivenEmoji?.count)}</small></span>
        <span><b>{r.topReceivedEmoji?.name || '—'}</b><small>Audience reaction · {fmt(r.topReceivedEmoji?.count)}</small></span>
      </div>;
    case 'fans': {
      const fan = r.biggestFan?.name;
      const stan = r.theyStan?.name;
      return <div className="flx-recap-costars">
        <span><Pfp name={username} size={72} /><b>{displayName}</b></span><i aria-hidden="true">↔</i>
        <span><Pfp name={fan || stan || username} size={72} /><b>{fan ? names[fan] ?? fan : stan ? names[stan] ?? stan : 'Co-star'}</b><small>#1 FAN</small></span>
      </div>;
    }
    case 'catchphrase': {
      const phrase = stats.script.catchphrases[0]?.phrase || 'Roll credits';
      return <div className="flx-recap-subtitles" aria-hidden="true">
        {[0, 1, 2].map(index => <span key={index} style={{ '--bubble': index } as CSSProperties}>{phrase}</span>)}
      </div>;
    }
    case 'laugh-track':
      return <div className="flx-recap-laugh" aria-label={`${fmt(stats.script.laughs)} laughs, ${(safeCount(stats.script.capsShare) * 100).toFixed(1)} percent all caps, ${fmt(stats.script.profanityCount)} curse words`}>
        <div aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--wave': i } as CSSProperties} />)}</div>
        <span><b>{fmt(stats.script.laughs)}</b> laughs</span><span><b>{(safeCount(stats.script.capsShare) * 100).toFixed(1)}%</b> shouted</span><span><b>{fmt(stats.script.profanityCount)}</b> bleeps</span>
      </div>;
    case 'monologue':
      return <div className="flx-recap-slate" aria-hidden="true">
        <div className="clap"><i /><i /><i /><i /></div>
        <div className="board"><span>NETFLIXIA</span><b>MONOLOGUE</b><small>SCENE 1 · TAKE 1</small><strong>{fmt(stats.script.monologue?.words)} WORDS</strong></div>
      </div>;
    case 'fame':
      return <div className="flx-recap-mentions" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i}>@{displayName}</span>)}</div>;
    case 'approval': {
      const score = cap(stats.fame.approval ?? 0, 100);
      return <div className="flx-recap-rating" style={{ '--rating': score } as CSSProperties} aria-label={`${score}% approval, ${approvalLabel(score)}`}><div><i /></div><strong>{approvalLabel(score)}</strong></div>;
    }
    case 'supporter-nemesis':
      return <div className="flx-recap-castline" aria-hidden="true">{card.people?.slice(0, 4).map(name => <Pfp key={name} name={name} size={52} />)}</div>;
    case 'persona':
      return <div className="flx-recap-casting" aria-hidden="true"><span>Comic Relief</span><span>Narrator</span><span>Wildcard</span><strong>{stats.persona.label || 'Cult Classic'}</strong><Pfp name={username} size={92} /></div>;
    case 'finale':
      return <div className="flx-recap-credits" aria-hidden="true"><Pfp name={username} size={88} /><span>STARRING</span><strong>{displayName}</strong><small>Renewed for another season</small></div>;
    default:
      return null;
  }
}

export function RecapScene({ card, stats, names, username, displayName, leaving = false, onPlay, actions }: {
  card: RecapCard;
  stats: RecapStats;
  names: Record<string, string>;
  username: string;
  displayName: string;
  leaving?: boolean;
  onPlay: (messageId: string) => void;
  actions?: ReactNode;
}) {
  const hour = cap(stats.airtime.peakHour, 23);
  const daypart = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening';
  return (
    <article className={`flx-recap-card accent-${card.accent}${leaving ? ' leaving' : ''}`} data-key={card.key} data-daypart={daypart} aria-label={`${card.kicker}: ${card.big}`}>
      <div className="flx-recap-backdrop" aria-hidden="true" />
      <CategoryAnimation card={card} stats={stats} username={username} displayName={displayName} names={names} />
      <div className="flx-recap-copy">
        <p className="kicker">{card.kicker}</p>
        <BigText card={card} />
        {card.sub && <p className="sub"><span className="subinner">{card.sub}</span></p>}
        {card.detail && <p className="detail">{card.detail}</p>}
        {card.people && card.people.length > 0 && (
          <div className="flx-recap-people">
            {card.people.map((name, index) => <span className="flx-recap-person" key={name} style={{ '--pi': index } as CSSProperties}><Pfp name={name} size={24} />{names[name] ?? name}</span>)}
          </div>
        )}
        {card.link?.kind === 'rewind' && <a className="flx-btn" href={`/rewind?at=${encodeURIComponent(card.link.at)}`} onClick={event => event.stopPropagation()}>Watch that night</a>}
        {card.link?.kind === 'player' && <button className="flx-btn" onClick={event => { event.stopPropagation(); onPlay(card.link!.kind === 'player' ? card.link!.messageId : ''); }}>Play the scene</button>}
        {actions}
      </div>
    </article>
  );
}
