<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Angular

[![npm version](https://img.shields.io/npm/v/@sentry/angular.svg)](https://www.npmjs.com/package/@sentry/angular)
[![npm dm](https://img.shields.io/npm/dm/@sentry/angular.svg)](https://www.npmjs.com/package/@sentry/angular)
[![npm dt](https://img.shields.io/npm/dt/@sentry/angular.svg)](https://www.npmjs.com/package/@sentry/angular)

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/angular/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## Angular Version Compatibility

**Important**: This package is not compatible with Angular 16 or newer. Please use [`@sentry/angular-ivy`](https://github.com/getsentry/sentry-javascript/tree/master/packages/angular-ivy) instead.

If you're using Angular 12 or newer, we recommend using `@sentry/angular-ivy` for native support with Angular's rendering engine Ivy.

This SDK stilll officially supports Angular 10-15. If you are using an older version of Angular and experience problems with the Angular SDK, we recommend downgrading the SDK to version 6.x.

## General

This package is a wrapper around `@sentry/browser`, with added functionality related to Angular. All methods available
in `@sentry/browser` can be imported from `@sentry/angular`.

To use this SDK, call `Sentry.init(options)` before you bootstrap your Angular application.

```javascript
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { init } from '@sentry/angular';

import { AppModule } from './app/app.module';

init({
  dsn: '__DSN__',
  // ...
});

// ...

enableProdMode();
platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .then(success => console.log(`Bootstrap success`))
  .catch(err => console.error(err));
```

### ErrorHandler

`@sentry/angular` exports a function to instantiate ErrorHandler provider that will automatically send Javascript errors
captured by the Angular's error handler.

```javascript
import { NgModule, ErrorHandler } from '@angular/core';
import { createErrorHandler } from '@sentry/angular';

@NgModule({
  // ...
  providers: [
    {
      provide: ErrorHandler,
      useValue: createErrorHandler({
        showDialog: true,
      }),
    },
  ],
  // ...
})
export class AppModule {}
```

Additionally, `createErrorHandler` accepts a set of options that allows you to configure its behavior. For more details
see `ErrorHandlerOptions` interface in `src/errorhandler.ts`.

### Tracing

`@sentry/angular` exports a Trace Service, Directive and Decorators that leverage the tracing
features to add Angular-related spans to transactions. If tracing is not enabled, this functionality
will not work. The SDK's `TraceService` itself tracks route changes and durations, while directive and decorators are tracking
components initializations.

#### Install

Registering a Trace Service is a 3-step process.

1. Register and configure the `BrowserTracing` integration, including custom Angular routing
   instrumentation:

```javascript
import { init, instrumentAngularRouting, BrowserTracing } from '@sentry/angular';

init({
  dsn: '__DSN__',
  integrations: [
    new BrowserTracing({
      tracingOrigins: ['localhost', 'https://yourserver.io/api'],
      routingInstrumentation: instrumentAngularRouting,
    }),
  ],
  tracesSampleRate: 1,
});
```

2. Register `SentryTrace` as a provider in Angular's DI system, with a `Router` as its dependency:

```javascript
import { NgModule } from '@angular/core';
import { Router } from '@angular/router';
import { TraceService } from '@sentry/angular';

@NgModule({
  // ...
  providers: [
    {
      provide: TraceService,
      deps: [Router],
    },
  ],
  // ...
})
export class AppModule {}
```

3. Either require the `TraceService` from inside `AppModule` or use `APP_INITIALIZER` to force-instantiate Tracing.

```javascript
@NgModule({
  // ...
})
export class AppModule {
  constructor(trace: TraceService) {}
}
```

or

```javascript
import { APP_INITIALIZER } from '@angular/core';

@NgModule({
  // ...
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [TraceService],
      multi: true,
    },
  ],
  // ...
})
export class AppModule {}
```

#### Use

To track Angular components as part of your transactions, you have 3 options.

_TraceDirective:_ used to track a duration between `OnInit` and `AfterViewInit` lifecycle hooks in template:

```javascript
import { TraceModule } from '@sentry/angular';

@NgModule({
  // ...
  imports: [TraceModule],
  // ...
})
export class AppModule {}
```

Then inside your components template (keep in mind that directive name attribute is required):

```html
<app-header trace="header"></app-header>
<articles-list trace="articles-list"></articles-list>
<app-footer trace="footer"></app-footer>
```

_TraceClassDecorator:_ used to track a duration between `OnInit` and `AfterViewInit` lifecycle hooks in components:

```javascript
import { Component } from '@angular/core';
import { TraceClassDecorator } from '@sentry/angular';

@Component({
  selector: 'layout-header',
  templateUrl: './header.component.html',
})
@TraceClassDecorator()
export class HeaderComponent {
  // ...
}
```

_TraceMethodDecorator:_ used to track a specific lifecycle hooks as point-in-time spans in components:

```javascript
import { Component, OnInit } from '@angular/core';
import { TraceMethodDecorator } from '@sentry/angular';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
})
export class FooterComponent implements OnInit {
  @TraceMethodDecorator()
  ngOnInit() {}
}
```

You can also add your own custom spans by attaching them to the current active transaction using `getActiveTransaction`
helper. For example, if you'd like to track the duration of Angular boostraping process, you can do it as follows:

```javascript
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { init, getActiveTransaction } from '@sentry/angular';

import { AppModule } from './app/app.module';

// ...

const activeTransaction = getActiveTransaction();
const boostrapSpan =
  activeTransaction &&
  activeTransaction.startChild({
    description: 'platform-browser-dynamic',
    op: 'ui.angular.bootstrap',
  });

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .then(() => console.log(`Bootstrap success`))
  .catch(err => console.error(err));
  .finally(() => {
    if (bootstrapSpan) {
      boostrapSpan.finish();
    }
  })
```
