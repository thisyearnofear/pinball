import React from "react";
import { Modal } from "./Modal";

export function AboutModal(props: { onClose: () => void }) {
  return (
    <Modal title="About" onClose={props.onClose}>
      <p>
        Mezo Pinball Arcade is a demo pinball game with onchain tournament scoring (MUSD) and Mezo
        Passport wallet integration.
      </p>

      <h3 style={{ marginTop: 16 }}>Credits</h3>
      <ul style={{ lineHeight: 1.6 }}>
        <li>
          Animation:{" "}
          <a href="https://codepen.io/nikhil8krishnan/pen/rVoXJa" target="_blank" rel="noreferrer">
            Loader
          </a>{" "}
          by Nikhil Krishnan
        </li>
        <li>
          Animation:{" "}
          <a href="https://codepen.io/himagna/pen/LYgqJoW" target="_blank" rel="noreferrer">
            CRT lines
          </a>{" "}
          by himagna
        </li>
        <li>
          Font:{" "}
          <a href="https://www.dafont.com/neon-overdrive.font" target="_blank" rel="noreferrer">
            Neon overdrive
          </a>{" "}
          by Darrell Flood
        </li>
        <li>
          Font:{" "}
          <a href="https://www.dafont.com/clubland.font" target="_blank" rel="noreferrer">
            Clubland
          </a>{" "}
          by Joseph Gibson
        </li>
        <li>
          Table design inspiration:{" "}
          <a href="https://en.wikipedia.org/wiki/Rollerball_(video_game)" target="_blank" rel="noreferrer">
            Rollerball
          </a>{" "}
          (HAL Laboratory)
        </li>
        <li>
          Programming:{" "}
          <a href="https://www.igorski.nl" target="_blank" rel="noreferrer">
            igorski
          </a>
        </li>
      </ul>
    </Modal>
  );
}

