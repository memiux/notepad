(function() {
	const noteId = 1,
	textarea = document.getElementById('note'),
	InfoBar = {
		metadata: null,
		infoBar: document.getElementById('infoBar'),
		update(metadata) {
			this.metadata = metadata;
			this.infoBar.innerText = (new Date(metadata.updated_at).toLocaleString());
		}
	},
	LoadingIndicator = {
		loadingIndicator: document.getElementById('loadingIndicator'),
		timeoutId: null,
		t0: null,
		show() {
			this.t0 = performance.now();
			clearTimeout(this.timeoutId);
			this.loadingIndicator.classList.add('active');
		},
		hide(force = false) {
			const timeElapsed = Math.ceil(performance.now() - this.t0);
			this.timeoutId = setTimeout(() => {
				this.loadingIndicator.classList.remove('active');
			}, (timeElapsed > 2000 || force) ? 0 : 2000 - timeElapsed);
		}
	},
	Menu = {
		hamburgerButton: document.getElementById('hamburgerButton'),
		menu: document.getElementById('menu'),
		setup() {
			window.Menu = Menu;
			this.hamburgerButton.style.visibility = 'visible';
			textarea.addEventListener('click', () => Menu.hide());
			this.hamburgerButton.addEventListener('click', () => {
				this.hamburgerButton.classList.toggle('active');
				this.menu.classList.toggle('open');
			});
		},
		hide() {
			this.menu.classList.remove('open');
			this.hamburgerButton.classList.remove('active');
		},
		actionLogout() {
			Notepad.logout().then(function() { location.reload(true); }).catch(console.error);
		},
		actionViewMasterKey() {
			this.hide();
			Snackbar.show({text: localStorage.getItem('masterKey'), actionText: 'OK', color: 'info', timeout: false});
		},
		actionDeleteMasterKey() {
			this.hide();
			textarea.style.visibility = 'hidden';
			localStorage.removeItem('masterKey');
			location.reload(true);
		}
	},
	Snackbar = {
		snackbar: document.getElementById('snackbar'),
		content: this.snackbar.querySelector('p'),
		actionButton: this.snackbar.querySelector('button'),
		timeoutId: null,
		defaultOptions: {
			text: '',
			color: 'info',
			timeout: 5000,
			actionText: "\u00d7",
			onClick() {
				Snackbar.hide();
			}
		},
		show(options) {
			options = Object.assign({}, this.defaultOptions, options);
			this.content.textContent = options.text;
			this.actionButton.textContent = options.actionText;
			this.actionButton.addEventListener('click', options.onClick);
			clearTimeout(this.timeoutId);
			this.snackbar.classList.remove('hidden', 'success', 'info', 'error');
			this.snackbar.classList.add('visible', options.color);
			if (options.timeout) this.timeoutId = setTimeout(() => this.hide(), options.timeout);
		},
		hide() {
			clearTimeout(this.timeoutId);
			this.snackbar.classList.remove('visible');
			this.snackbar.classList.add('hidden');
			// this.content.textContent = "\u00a0";
		}
	},
	Encryptor = {
		key: null,
		hexMap: Array(0x100).fill().map((_, idx) => idx.toString(16).padStart(2, '0')),
		generateKey() {
			return crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']).then(key => {
				return crypto.subtle.exportKey('raw', key).then(exportedKey => this.toHex(exportedKey));
			});
		},
		importKey(key) {
			return crypto.subtle.importKey('raw', this.toBytes(key), {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']).then(key => this.key = key);
		},
		encrypt(plaintext) {
			const iv = crypto.getRandomValues(new Uint8Array(12));
			return crypto.subtle.encrypt({name: 'AES-GCM', iv: iv}, this.key, new TextEncoder().encode(plaintext)).then(ciphertext => ({iv: this.toHex(iv), ciphertext: this.toHex(ciphertext)}));
		},
		decrypt(iv, ciphertext) {
			return crypto.subtle.decrypt({name: 'AES-GCM', iv: this.toBytes(iv)}, this.key, this.toBytes(ciphertext)).then(plaintext => new TextDecoder().decode(plaintext));
		},
		toHex(bytes) {
			return Array.prototype.map.call(new Uint8Array(bytes), byte => this.hexMap[byte]).join('');
		},
		toBytes(hex) {
			const buffer = new Uint8Array(hex.length / 2);
			for (let i = 0; i < buffer.length; i++) buffer[i] = parseInt(hex.substr(i * 2, 2), 16);
			return buffer;
		}
	},
	Notepad = {
		unsaved: false,
		ping() {
			return axios.get('/api/ping.json').then(request => request.data);
		},
		getNote(id) {
			return axios.get(`/api/notes/${id}.json`).then(request => request.data['note']);
		},
		saveNote(id, body) {
			return axios.put(`/api/notes/${id}.json`, {
				note: {
					body: body,
					metadata: {
						updated_at: '[UPDATED_AT]'
					}
				}
			}).then(request => request.data);
		},
		logout() {
			return axios.delete('/api/logout.json').then(request => request.data);
		},
		debounce(callback, delay, onBounce = null) {
			let timeoutId;
			return function() {
				if (onBounce) onBounce();
				clearTimeout(timeoutId);
				timeoutId = setTimeout(callback, delay);
			}
		}
	},
	Reloader = {
		setup() {
			window.addEventListener('focus', this.reload);
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState == 'visible') this.reload();
			});
		},
		reload() {
			const now = Math.round(new Date().getTime() / 1000), lastChecked = parseInt(localStorage.getItem('lastChecked') || 0);
			if (Notepad.unsaved || now - lastChecked < 20) return;
			localStorage.setItem('lastChecked', now);
			Notepad.getNote(noteId).then(note => {
				if (note.metadata.updated_at <= InfoBar.metadata.updated_at) return;
				LoadingIndicator.show();
				InfoBar.update(note.metadata);
				Encryptor.decrypt(note.body.iv, note.body.ciphertext).then(plaintext => {
					textarea.value = plaintext;
				}).catch(console.error).finally(() => {
					LoadingIndicator.hide();
				});
			}).catch(console.error);
		}
	};

	function loadMasterKey(masterKey = null) {
		return new Promise((resolve, reject) => {
			if (masterKey = masterKey || localStorage.getItem('masterKey')) {
				resolve([masterKey]);
			} else {
				if (masterKey = prompt('Enter your master key (optional)')) {
					localStorage.setItem('masterKey', masterKey);
					resolve([masterKey]);
				} else {
					Encryptor.generateKey().then(newMasterKey => {
						localStorage.setItem('masterKey', newMasterKey);
						Snackbar.show({text: 'A new master key has been generated', color: 'success'});
						resolve([newMasterKey, true]);
					});
				}
			}
		});
	}

	function loadNote() {
		LoadingIndicator.show();
		Notepad.getNote(noteId).then(note => {
			InfoBar.update(note.metadata);
			Encryptor.decrypt(note.body.iv, note.body.ciphertext).then(plaintext => {
				textarea.value = plaintext;
			}).catch(error => {
				console.error('Encryptor.decrypt', error);
				Snackbar.show({text: 'An error occurred while decrypting your note', color: 'error'});
			});
		}).catch(error => {
			console.error(error);
			if (Object(error.response).status == 404) Snackbar.show({text: 'Note not found', color: 'error'});
		}).finally(() => {
			textarea.disabled = false;
			LoadingIndicator.hide(true);
		});
	}

	function saveNote() {
		if (!Notepad.unsaved) return;
		LoadingIndicator.show();
		Encryptor.encrypt(textarea.value).then(payload => {
			Notepad.saveNote(noteId, payload).then(data => {
				Notepad.unsaved = false;
				InfoBar.update(data.metadata);
				LoadingIndicator.hide();
				document.dispatchEvent(new CustomEvent('noteSaved'));
			}).catch(console.error);
		}).catch(console.error);
	}

	textarea.addEventListener('input', Notepad.debounce(saveNote, 2000, function() { Notepad.unsaved = true; }));
	textarea.addEventListener('change', saveNote);

	window.addEventListener('load', function() {
		loadMasterKey().then(([masterKey, isNew]) => {
			Encryptor.importKey(masterKey).then(() => {
				if (isNew) {
					document.addEventListener('noteSaved', Reloader.setup, {once: true});
					textarea.disabled = false;
				} else {
					loadNote();
					Reloader.setup();
				}
			}).catch(error => {
				console.error('Encryptor.importKey', error);
				Snackbar.show({text: 'Your master key appears to be invalid', color: 'error'});
			}).finally(Menu.setup);
		});
	});

	window.addEventListener('beforeunload', function(e) {
		if (Notepad.unsaved) {
			e.preventDefault();
			e.returnValue = '';
		}
	});
})();
