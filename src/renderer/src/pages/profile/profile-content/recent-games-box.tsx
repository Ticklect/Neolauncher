import { buildGameDetailsPath } from "@renderer/helpers";
import { Link } from "@renderer/components";
import { useCallback, useContext } from "react";
import { userProfileContext } from "@renderer/context";
import { useTranslation } from "react-i18next";
import { ClockIcon } from "@primer/octicons-react";
import { useFormat } from "@renderer/hooks";
import type { UserGame } from "@types";
import { MAX_MINUTES_TO_SHOW_IN_PLAYTIME } from "@renderer/constants";
import "./recent-games-box.scss";

export function RecentGamesBox() {
  const { userProfile } = useContext(userProfileContext);

  const { t } = useTranslation("user_profile");

  const { numberFormatter } = useFormat();

  const formatPlayTime = useCallback(
    (game: UserGame) => {
      const seconds = game?.playTimeInSeconds || 0;
      const minutes = seconds / 60;

      if (minutes < MAX_MINUTES_TO_SHOW_IN_PLAYTIME) {
        return t("amount_minutes", {
          amount: minutes.toFixed(0),
        });
      }

      const hours = minutes / 60;
      return t("amount_hours", { amount: numberFormatter.format(hours) });
    },
    [numberFormatter, t]
  );

  const buildUserGameDetailsPath = (game: UserGame) =>
    buildGameDetailsPath({
      ...game,
      objectId: game.objectId,
    });

  if (!userProfile?.recentGames.length) return null;

  return (
    <div>
      <div className="recent-games__section-header">
        <h2>{t("activity")}</h2>
      </div>

      <div className="recent-games__box">
        <ul className="recent-games__list">
          {userProfile?.recentGames.map((game) => (
            <li key={`${game.shop}-${game.objectId}`}>
              <Link
                to={buildUserGameDetailsPath(game)}
                className="recent-games__list-item"
              >
                <img
                  src={game.iconUrl!}
                  alt={game.title}
                  className="recent-games__game-image"
                />

                <div className="recent-games__game-details">
                  <span className="recent-games__game-title">{game.title}</span>

                  <div className="recent-games__game-description">
                    <ClockIcon />
                    <small>{formatPlayTime(game)}</small>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
