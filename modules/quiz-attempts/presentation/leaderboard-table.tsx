import type { LeaderboardEntry } from "@/modules/quiz-attempts/application/take-quiz";
import { formatElapsedTime } from "@/lib/format-time";

const percentageFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function LeaderboardTable({
  entries,
  currentPlayer,
}: {
  entries: LeaderboardEntry[];
  currentPlayer?: LeaderboardEntry | null;
}) {
  if (entries.length === 0) {
    return (
      <div className="vc-surface p-6 text-center">
        <p className="vc-heading text-lg">No leaderboard entries yet</p>
        <p className="vc-body-copy mt-2 text-sm">Complete the quiz to claim the first spot.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="space-y-3 md:hidden" aria-label="Quiz leaderboard">
        {entries.map((entry) => {
          const isCurrentPlayer = entry.isCurrentPlayer || entry.rank === currentPlayer?.rank;

          return (
            <li
              key={`mobile-${entry.rank}-${entry.participantName}`}
              className={`vc-surface p-4 ${isCurrentPlayer ? "border-sun-500/80 bg-sun-500/10" : ""}`}
              aria-current={isCurrentPlayer ? "true" : undefined}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-sun-500">
                    Rank #{entry.rank}
                  </p>
                  <p className="mt-1 break-words font-semibold">
                    {entry.participantName}
                  </p>
                </div>
                {isCurrentPlayer ? (
                  <span className="shrink-0 rounded-full border border-sun-500 px-2 py-1 text-xs font-semibold text-sun-500">
                    You
                  </span>
                ) : null}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-outline-500/40 pt-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-lavender-300">Score</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {percentageFormat.format(entry.percentage)}%
                    <span className="block text-xs font-normal text-lavender-500">
                      {entry.score}/{entry.maxScore} points
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-lavender-300">Time</dt>
                  <dd className="mt-1 font-mono font-semibold tabular-nums">
                    {formatElapsedTime(entry.elapsedMs)}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>

      <div className="hidden overflow-x-auto vc-surface md:block">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="border-b border-outline-500/60 text-xs uppercase tracking-wider text-lavender-300">
            <tr>
              <th scope="col" className="px-4 py-3">Rank</th>
              <th scope="col" className="px-4 py-3">Player</th>
              <th scope="col" className="px-4 py-3 text-right">Score</th>
              <th scope="col" className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-500/30">
            {entries.map((entry) => {
              const isCurrentPlayer = entry.isCurrentPlayer || entry.rank === currentPlayer?.rank;

              return (
                <tr
                  key={`${entry.rank}-${entry.participantName}`}
                  className={isCurrentPlayer ? "bg-sun-500/10" : undefined}
                  aria-current={isCurrentPlayer ? "true" : undefined}
                >
                  <th scope="row" className="px-4 py-3 font-bold text-sun-500">#{entry.rank}</th>
                  <td className="max-w-48 truncate px-4 py-3 font-medium">
                    {entry.participantName}{isCurrentPlayer ? " (you)" : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {percentageFormat.format(entry.percentage)}%
                    <span className="ml-1 text-xs text-lavender-500">
                      ({entry.score}/{entry.maxScore})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatElapsedTime(entry.elapsedMs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
