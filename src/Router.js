import URL from 'url-parse';
import {EventEmitter} from './EventEmitter';
import {Route} from './Route';
import {Transition} from './Transition';

export class Router extends EventEmitter {
	/**
	 * @param {Function} onStart?
	 * @param {Function} onLeave?
	 * @param {Function} onBeforeEnter?
	 * @param {Function} onEnter?
	 * @param {Function} onComplete?
	 * @param {Function} onNotFound?
	 */
	constructor({onStart, onLeave, onBeforeEnter, onEnter, onComplete, onNotFound} = {}) {
		super();

		this.routes = [];
		this.transitions = [];
		this.route = null;
		this.params = null;
		this.query = null;

		this.handlers = {
			start: [],
			leave: [],
			beforeEnter: [],
			enter: [],
			complete: [],
			notFound: [],
		};

		if (onStart) {
			this.on('start', onStart);
		}

		if (onLeave) {
			this.on('leave', onLeave);
		}

		if (onBeforeEnter) {
			this.on('beforeEnter', onBeforeEnter);
		}

		if (onEnter) {
			this.on('enter', onEnter);
		}

		if (onComplete) {
			this.on('complete', onComplete);
		}

		if (onNotFound) {
			this.on('notFound', onNotFound);
		}
	}

	/**
	 * @param {string} path
	 * @returns {Route|undefined}
	 */
	getRouteByPath(path) {
		return this.routes.find((route) => route.path === path);
	}

	/**
	 * @param {string} name
	 * @returns {Route|undefined}
	 */
	getRouteByName(name) {
		return this.routes.find((route) => name && route.name === name);
	}

	/**
	 * @param {Route} from
	 * @param {Route} to
	 * @returns {Transition|undefined}
	 */
	getTransitionByRoute(from, to) {
		return this.transitions.find((transition) => (
			transition.from === from && transition.to === to
		));
	}

	/**
	 * @param {string} fromPath
	 * @param {string} toPath
	 * @returns {Transition|undefined}
	 */
	getTransitionByRoutePath(fromPath, toPath) {
		return this.transitions.find((transition) => (
			fromPath === null && transition.from === null ||
			transition.from && transition.from.path === fromPath && transition.to.path === toPath
		));
	}

	/**
	 * @param {string} fromName
	 * @param {string} toName
	 * @returns {Transition|undefined}
	 */
	getTransitionByRouteName(fromName, toName) {
		return this.transitions.find((transition) => (
			fromName === null && transition.from === null ||
			transition.from && transition.from.name === fromName && transition.to.name === toName
		));
	}

	/**
	 * @param {Route|{path: string, name?: string, onBeforeEnter?: Function, onEnter?: Function, onLeave?: Function, options?: Object}} route
	 * @returns {Route|null}
	 */
	addRoute(route) {
		if (!route) {
			return null;
		}

		if (!(route instanceof Route)) {
			route = new Route(route);
		}

		let existingRoute = this.routes.find((existingRoute) => (
			existingRoute.path === route.path || route.name && existingRoute.name === route.name
		));

		if (existingRoute) {
			return existingRoute;
		}

		this.routes.push(route);

		return route;
	}

	/**
	 * @param {Transition|{from: Route|string, to: Route|string, onStart?: Function, onLeave?: Function, onBeforeEnter?: Function, onEnter?: Function, onComplete?: Function}} transition
	 * @returns {Transition|null}
	 */
	addTransition(transition) {
		if (!transition) {
			return null;
		}

		if (!(transition instanceof Transition)) {
			transition = new Transition(transition);
		}

		transition.from = this.addRoute(transition.from);
		transition.to = this.addRoute(transition.to);

		let existingTransition = this.transitions.find((existingTransition) => (
			(
				existingTransition.from === transition.from ||
				existingTransition.from && transition.from &&
				(
					existingTransition.from.path === transition.from.path ||
					existingTransition.from.name === transition.from.name
				)
			)
			&&
			(
				existingTransition.to === transition.to ||
				existingTransition.to.path === transition.to.path ||
				existingTransition.to.name === transition.to.name
			)
		));

		if (existingTransition) {
			return existingTransition;
		}

		this.transitions.push(transition);

		return transition;
	}

	/**
	 * @param {string} path
	 * @param {string} method?
	 */
	resolve(path, {method = 'push'} = {}) {
		let url = new URL(path, true);
		let routeFound = false;

		for (let route of this.routes) {
			let params = route.execPath(url.pathname);

			if (params) {
				routeFound = true;

				let prevState = {
					route: this.route,
					params: this.params,
					query: this.query,
				};

				let nextState = {
					route,
					params,
					query: url.query,
				};

				let transition = this.getTransitionByRoute(this.route, route);

				if (transition) {
					Promise.all([
						this.trigger('start', [prevState, nextState]),
						transition.trigger('start', [prevState, nextState]),
					])
						.then(() => Promise.all([
							this.trigger('leave', [prevState, nextState]),
							transition.trigger('leave', [prevState, nextState]),
							Promise.resolve(this.route ? this.route.trigger('leave', [prevState, nextState]) : null),
						]))
						.then(() => Promise.all([
							this.trigger('beforeEnter', [prevState, nextState]),
							transition.trigger('beforeEnter', [prevState, nextState]),
							route.trigger('beforeEnter', [prevState, nextState]),
						]))
						.then(() => {
							this.route = route;
							this.query = url.query;
							this.params = params;

							if ((method === 'push' && path !== location.pathname + location.search + location.hash) || method === 'replace') {
								history[`${method}State`](null, '', path);
							}
						})
						.then(() => Promise.all([
							this.trigger('enter', [prevState, nextState]),
							transition.trigger('enter', [prevState, nextState]),
							route.trigger('enter', [prevState, nextState]),
						]))
						.then(() => Promise.all([
							this.trigger('complete', [prevState, nextState]),
							transition.trigger('complete', [prevState, nextState]),
						]));
				} else {
					this.trigger('start', [prevState, nextState])
						.then(() => Promise.all([
							this.trigger('leave', [prevState, nextState]),
							Promise.resolve(this.route ? this.route.trigger('leave', [prevState, nextState]) : null),
						]))
						.then(() => Promise.all([
							this.trigger('beforeEnter', [prevState, nextState]),
							route.trigger('beforeEnter', [prevState, nextState]),
						]))
						.then(() => {
							this.route = route;
							this.params = params;
							this.query = url.query;

							if ((method === 'push' && path !== location.pathname + location.search + location.hash) || method === 'replace') {
								history[`${method}State`](null, '', path);
							}
						})
						.then(() => Promise.all([
							this.trigger('enter', [prevState, nextState]),
							route.trigger('enter', [prevState, nextState]),
						]))
						.then(() => this.trigger('complete', [prevState, nextState]));
				}
			}
		}

		if (!routeFound) {
			this.trigger('notFound', [path, url.query]);
		}
	}

	/**
	 * @param {Route|string} route
	 * @param {Object} params?
	 * @param {Object} query?
	 * @param {string} hash?
	 * @param {string|boolean} method?
	 */
	navigate(route, {params, query, hash, method = 'push'} = {}) {
		if (!(route instanceof Route)) {
			route = this.routes.find((existingRoute) => (
				existingRoute.path === route.path || route.name && existingRoute.name === route.name
			));
		}

		if (route) {
			let path = route.generatePath(params, query, hash);

			if (path !== location.pathname + location.search + location.hash) {
				this.resolve(path, {method});
			}
		}
	}

	bindLinks() {
		Array.from(document.querySelectorAll('[data-router-link]')).forEach((link) => {
			if (!link.isBound) {
				link.isBound = true;

				link.addEventListener('click', (event) => {
					event.preventDefault();
					this.navigate(link.getAttribute('href'));
				});
			}
		});
	}

	listen() {
		window.addEventListener('popstate', () => {
			this.resolve(location.pathname + location.search + location.hash, 'none');
		});
	}

	start() {
		this.bindLinks();
		this.listen();
		this.resolve(location.pathname + location.search + location.hash);
	}
}
