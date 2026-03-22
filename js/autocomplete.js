/**
 * Search-as-you-type autocomplete component.
 */
const Autocomplete = (() => {
  let input, list;
  let activeIndex = -1;
  let items = [];
  let onSelect = null;

  function init(inputEl, listEl, selectCallback) {
    input = inputEl;
    list = listEl;
    onSelect = selectCallback;

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('focus', onInput);
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !list.contains(e.target)) {
        close();
      }
    });
  }

  function onInput() {
    const query = input.value.trim();
    items = DataManager.searchPlayers(query);
    activeIndex = -1;
    render();
  }

  function onKeyDown(e) {
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < items.length) {
        selectItem(items[activeIndex]);
      } else if (items.length > 0) {
        selectItem(items[0]);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function render() {
    list.innerHTML = '';
    if (items.length === 0) {
      close();
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const li = document.createElement('li');
      li.className = 'autocomplete__item' + (i === activeIndex ? ' active' : '');
      li.setAttribute('role', 'option');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = items[i].name;

      const posSpan = document.createElement('span');
      posSpan.className = 'autocomplete__item-pos';
      posSpan.textContent = items[i].position;

      li.appendChild(nameSpan);
      li.appendChild(posSpan);
      li.addEventListener('click', () => selectItem(items[i]));
      li.addEventListener('mouseenter', () => {
        activeIndex = i;
        updateActive();
      });
      list.appendChild(li);
    }

    list.classList.add('open');
  }

  function updateActive() {
    const children = list.children;
    for (let i = 0; i < children.length; i++) {
      children[i].classList.toggle('active', i === activeIndex);
    }
  }

  function selectItem(player) {
    input.value = '';
    close();
    if (onSelect) onSelect(player);
  }

  function close() {
    list.innerHTML = '';
    list.classList.remove('open');
    items = [];
    activeIndex = -1;
  }

  function setEnabled(enabled) {
    input.disabled = !enabled;
    if (!enabled) close();
  }

  return { init, setEnabled, close };
})();
