import React from 'react';
import { registerRootComponent } from 'expo';
import App from './src/App';
import { resolveCandidateServices } from './src/services/resolveServices';

/**
 * The service boundary. Which implementation the app runs against is decided
 * here and nowhere else, so no screen and no model has any idea whether it is
 * talking to a backend or to the fixtures. Flip `expo.extra.useMocks` in
 * app.json to move the whole app onto the real API.
 */
const resolved = resolveCandidateServices();

function Root() {
  return React.createElement(App, {
    services: resolved.services,
    corridorKey: resolved.corridorKey,
    registerSessionLost: resolved.registerSessionLost,
  });
}

registerRootComponent(Root);
