import { BasePlugin, BaseComponent } from 'vatom-spaces-plugins'

/**
 * Asset Link Plugin
 *
 * This plugin links assets together via interactions. It registers three components:
 *
 *  • Trigger Component – activated via On-Click, Proximity, or Multi-Proximity interactions.
 *     It sends out a trigger message using a user-defined ActionID. It can restrict activation
 *     by role and assign a role upon activation.
 *
 *  • Receiver Component – listens for triggers and performs animations and sound.
 *     It supports both Reactive and Transition animation modes. It can restrict processing
 *     based on required roles. Sound may be played locally or relayed to secondary outputs.
 *
 *  • Asset Link Secondary Audio Output – relays sound from a specified source so that the sound is
 *     played from this asset’s location.
 *
 * An admin-only Role Management panel is registered for admin users. This panel (loaded from
 * role-management.html in the dist folder) lets admins define available roles and clear all role assignments.
 *
 * User roles persist across sessions until explicitly cleared.
 *
 * @license MIT
 * @author Leone Amurri
 */
export default class AssetLink extends BasePlugin {
  static get id() { return 'assetlink' }
  static get name() { return 'Asset Link' }
  static get description() { return 'Link assets together via interactive triggers, receivers, and secondary audio outputs.' }

  instanceID = Math.random().toString(36).substring(2);
  triggerComponents = [];
  receiverComponents = [];
  secondaryComponents = [];

  // Global mapping of user roles (userID -> array of role strings)
  userRoles = {};

  availableRoles = '';

  getUserRoles(userID) {
    return this.userRoles[userID] || [];
  }

  assignUserRole(userID, role) {
    if (!this.userRoles[userID]) {
      this.userRoles[userID] = [];
    }
    if (this.userRoles[userID].indexOf(role) === -1) {
      this.userRoles[userID].push(role);
      console.log(`Assigned role "${role}" to user ${userID}. Current roles:`, this.userRoles[userID]);
    }
  }

  clearAllRoles() {
    this.userRoles = {};
    console.log("Cleared all user roles.");
  }

  isValidRole(role) {
    const validRoles = this.availableRoles.split(',').map(r => r.trim()).filter(r => r.length > 0);
    return validRoles.includes(role);
  }

  getUserRolesDisplay() {
    let display = '';
    for (let user in this.userRoles) {
      display += `${user}: ${this.userRoles[user].join(', ')}\n`;
    }
    return display.trim();
  }

  async onLoad() {
    // Clear internal arrays.
    this.triggerComponents = [];
    this.receiverComponents = [];
    this.secondaryComponents = [];

    // Load available roles from localStorage, if present.
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('assetlink-roles');
      if (stored) {
        this.availableRoles = stored;
        console.log("Loaded availableRoles from localStorage:", this.availableRoles);
      }
    }

    this.userID = await this.user.getID();
    console.log("AssetLink onLoad: userID =", this.userID);

    // Register admin-only Role Management panel.
    if (await this.user.isAdmin()) {
      this.menus.register({
        id: 'assetlink-role-management',
        title: 'Role Management',
        text: 'Roles',
        icon: this.paths.absolute('role-icon.png'),
        section: 'admin-panel',
        panel: {
          fields: [
            {
              id: 'roles',
              name: 'Define Roles (comma-separated)',
              help: 'Enter roles separated by commas.',
              type: 'textarea',
              initialValue: this.availableRoles,
              placeholder: 'e.g., level01, level02, admin',
              onChange: (value) => {
                this.availableRoles = value;
                console.log("Roles updated in admin panel:", this.availableRoles);
              }
            },
            {
              id: 'saveRoles',
              name: 'Save Roles',
              type: 'button',
              onClick: () => {
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('assetlink-roles', this.availableRoles);
                  console.log("Saved roles to localStorage:", this.availableRoles);
                }
                this.hooks.trigger('assetlink.rolecall', this.availableRoles);
                this.triggerComponents.forEach(comp => {
                  if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
                });
                this.receiverComponents.forEach(comp => {
                  if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
                });
              }
            },
            {
              id: 'clearRoles',
              name: 'Clear All Roles',
              type: 'button',
              onClick: () => {
                this.clearAllRoles();
                this.availableRoles = '';
                if (typeof localStorage !== 'undefined') {
                  localStorage.removeItem('assetlink-roles');
                  console.log("Removed roles from localStorage.");
                }
                this.hooks.trigger('assetlink.rolecall', this.availableRoles);
                this.triggerComponents.forEach(comp => {
                  if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
                });
                this.receiverComponents.forEach(comp => {
                  if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
                });
              }
            },
            {
              id: 'userRolesDisplay',
              name: 'User Roles',
              type: 'label',
              value: this.getUserRolesDisplay(),
              help: 'List of users and their assigned roles.'
            }
          ],
          width: 350,
          height: 250
        }
      });
    }

    // Register Trigger Component.
    this.objects.registerComponent(TriggerComponent, {
      id: 'asset-link-trigger',
      name: 'Asset Link Trigger',
      description: 'Sends a trigger based on user interaction using a defined ActionID. ' +
                   'Can restrict activation by role and assign a role when triggered.',
      settings: [
        { id: 'header-interaction', type: 'label', value: 'Interaction Settings' },
        { id: 'inputType', name: 'Input Type', type: 'select', help: 'Select the interaction type.',
          values: ['On-Click', 'Proximity', 'Multi-Proximity'], default: 'On-Click' },
        { id: 'proximityDistance', name: 'Proximity Distance', type: 'number',
          help: 'Distance (in meters) for proximity triggers.', default: 2 },
        { id: 'requiredUserCount', name: 'Required Users', type: 'number',
          help: 'Users required in Multi-Proximity mode.', default: 2 },
        { id: 'header-action', type: 'label', value: 'Action Settings' },
        { id: 'actionID', name: 'ActionID', type: 'input',
          help: 'Enter a unique ActionID for this trigger.' },
        { id: 'adminOnly', name: 'Admin Only', type: 'checkbox',
          help: 'If checked, only admin users can trigger this asset.', default: false },
        // New Role-based settings.
        { id: 'roleRestricted', name: 'Role Restricted', type: 'checkbox',
          help: 'If checked, only users with a specified role can trigger this asset.', default: false },
        { id: 'requiredRole', name: 'Required Role', type: 'input',
          help: 'Enter the role required to trigger this asset (must be a valid role).' },
        { id: 'assignRole', name: 'Role to Assign', type: 'input',
          help: 'Enter the role to assign to a user upon trigger activation (must be a valid role).' }
      ]
    });

    // Register Receiver Component.
    this.objects.registerComponent(ReceiverComponent, {
      id: 'asset-link-receiver',
      name: 'Asset Link Receiver',
      description: 'Listens for triggers and performs animations and sound. Also relays its sound via messages. ' +
                   'Can restrict processing based on required roles.',
      settings: [
        { id: 'header-receiver', type: 'label', value: 'Receiver Settings' },
        { id: 'actionID', name: 'ActionID', type: 'input',
          help: 'Enter the ActionID this receiver should listen for. (Ensure unique IDs for independent assets)' },
        { id: 'adminOnly', name: 'Admin Only', type: 'checkbox',
          help: 'If checked, this receiver only processes triggers from admin users.', default: false },
        // Role-based settings.
        { id: 'roleRestricted', name: 'Role Restricted', type: 'checkbox',
          help: 'If checked, only triggers from users with the required role will be processed.', default: false },
        { id: 'requiredRole', name: 'Required Role', type: 'input',
          help: 'Enter the role required to interact with this receiver (must be a valid role).' },
        { id: 'animationMode', name: 'Animation Mode', type: 'select',
          help: 'Reactive: one-off animation; Transition: cycle or mapping transitions.',
          values: ['Reactive', 'Transition'], default: 'Reactive' },
        { id: 'header-sound', type: 'label', value: 'Sound Settings' },
        { id: 'sound', name: 'Sound', type: 'string',
          help: 'Sound file URL (or path) for playback (applies to both Reactive and Transition modes).', default: '' },
        { id: 'volume', name: 'Volume', type: 'slider',
          help: 'Set the volume for audio playback (0 to 1).', default: 1, min: 0, max: 1, precision: 2 },
        { id: 'disableLocalAudio', name: 'Disable Local Audio', type: 'checkbox',
          help: 'If checked, the receiver will not play audio locally (only secondary outputs will play audio).', default: false },
        { id: 'header-reactive', type: 'label', value: 'Reactive Settings' },
        { id: 'reactiveAnimation', name: 'Reactive Animation', type: 'string',
          help: 'Animation to play when triggered (active state).', default: 'active' },
        { id: 'defaultAnimation', name: 'Default Animation', type: 'string',
          help: 'Animation to revert to (idle state).', default: 'default' },
        { id: 'cooldown', name: 'Cooldown', type: 'number',
          help: 'Minimum time (in seconds) before the asset can be triggered again. Default is 1 second.', default: 1 },
        { id: 'header-transition', type: 'label', value: 'Transition Settings' },
        { id: 'transitionMode', name: 'Transition Mode', type: 'select',
          help: 'Cycle: bidirectional cycle; Mapping: custom transitions.',
          values: ['Cycle', 'Mapping'], default: 'Cycle' },
        { id: 'staticStates', name: 'Static States', type: 'string',
          help: 'Comma-separated static state animation names.', default: 'static01, static02, static03' },
        { id: 'forwardTransitions', name: 'Forward Transitions', type: 'string',
          help: 'Comma-separated forward transition animations.', default: 'transition01, transition02' },
        { id: 'reverseTransitions', name: 'Reverse Transitions', type: 'string',
          help: 'Comma-separated reverse transition animations (order will be reversed internally).', default: 'return02, return01' },
        { id: 'initialState', name: 'Initial State', type: 'string',
          help: 'Initial static state (Mapping mode).', default: 'static01' },
        { id: 'transitionMapping', name: 'Transition Mapping', type: 'string',
          help: 'JSON array defining custom transitions (include keys: "from", "to", "forward", "return"; optional: "soundForward", "soundReturn").', default: '[]' }
      ]
    });

    // Register Secondary Audio Output Component.
    this.objects.registerComponent(AssetLinkSecondaryAudioOutput, {
      id: 'asset-link-secondary',
      name: 'Asset Link Secondary Audio Output',
      description: 'Relays sound from a specified source so that the sound is played from this asset’s location.',
      settings: [
        { id: 'sourceID', name: 'Source Object ID', type: 'input', help: 'Enter the ID of the object whose sound should be relayed.' }
      ]
    });

    window.addEventListener('message', (event) => {
      if (event.data && event.data.action === 'updateRoles') {
        console.log("Received updateRoles event:", event.data.roles);
        this.availableRoles = event.data.roles;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('assetlink-roles', this.availableRoles);
        }
        const activeId = document.activeElement ? document.activeElement.id : '';
        this.triggerComponents.forEach(comp => {
          if (activeId !== 'requiredRole' && activeId !== 'assignRole') {
            if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
          }
        });
        this.receiverComponents.forEach(comp => {
          if (activeId !== 'requiredRole') {
            if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
          }
        });
      }
      if (event.data && event.data.action === 'clearAllRoles') {
        console.log("Received clearAllRoles event.");
        this.clearAllRoles();
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('assetlink-roles');
        }
        const activeId = document.activeElement ? document.activeElement.id : '';
        this.triggerComponents.forEach(comp => {
          if (activeId !== 'requiredRole' && activeId !== 'assignRole') {
            if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
          }
        });
        this.receiverComponents.forEach(comp => {
          if (activeId !== 'requiredRole') {
            if (typeof comp.onSettingsUpdated === 'function') comp.onSettingsUpdated();
          }
        });
      }
    });
  }

  async onMessage(msg) {
    this.receiverComponents.forEach(comp => {
      if (comp.getField('actionID') === msg.actionID) {
        if (String(comp.getField('adminOnly')).toLowerCase() === "true" && !msg.isAdmin) return;
        comp.sendMessage({
          fromUser: this.userID,
          action: 'trigger',
          actionID: msg.actionID,
          isAdmin: msg.isAdmin,
          userID: msg.userID
        }, true);
      }
    });
    this.secondaryComponents.forEach(comp => {
      comp.sendMessage(msg, true);
    });
  }

  updateAvailableRoles(rolesCommaSeparated) {
    this.availableRoles = rolesCommaSeparated
      .split(',')
      .map(r => r.trim())
      .filter(r => r.length > 0)
      .join(',');
  }
}

/**
 * Trigger Component
 */
class TriggerComponent extends BaseComponent {
  async onLoad() {
    this.plugin.triggerComponents.push(this);
    this.userID = await this.plugin.user.getID();
    // Set initial state from current settings.
    this.currentInputType = (this.getField('inputType') || "On-Click").trim().toLowerCase();
    console.log("Trigger onLoad: currentInputType =", this.currentInputType);
    if (this.currentInputType === 'proximity' || this.currentInputType === 'multi-proximity') {
      this.timer = setInterval(this.checkProximity.bind(this), 100);
    }
    // The Vatom framework should call onSettingsUpdated automatically when settings change.
  }

  async onSettingsUpdated() {
    const newInputType = (this.getField('inputType') || "On-Click").trim().toLowerCase();
    console.log("Trigger onSettingsUpdated: newInputType =", newInputType, 
                "requiredRole =", this.getField('requiredRole'),
                "assignRole =", this.getField('assignRole'));
    if (newInputType !== this.currentInputType) {
      this.currentInputType = newInputType;
      this.triggered = false;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
    if (newInputType === 'proximity' || newInputType === 'multi-proximity') {
      if (!this.timer) {
        this.timer = setInterval(this.checkProximity.bind(this), 100);
      }
    } else {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }

  onUnload() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inputTypeChecker) {
      clearInterval(this.inputTypeChecker);
      this.inputTypeChecker = null;
    }
    const index = this.plugin.triggerComponents.indexOf(this);
    if (index > -1) {
      this.plugin.triggerComponents.splice(index, 1);
    }
    console.log("[Trigger] onUnload: Removed object", this.objectID);
  }

  async onClick() {
    if ((this.getField('inputType') || "On-Click").trim().toLowerCase() === 'on-click') {
      console.log("[Trigger] onClick: Triggering for object", this.objectID);
      await this.trigger();
    }
  }

  async checkProximity() {
    const inputType = (this.getField('inputType') || "On-Click").trim().toLowerCase();
    const proximityDistance = parseFloat(this.getField('proximityDistance')) || 2;
    const userPosition = await this.plugin.user.getPosition();
    const objPosition = { x: this.fields.x, y: this.fields.height, z: this.fields.y };
    const distance = this.dist(objPosition.x, objPosition.y, objPosition.z,
                               userPosition.x, userPosition.y, userPosition.z);
    if (inputType === 'proximity') {
      if (distance <= proximityDistance) {
        if (!this.triggered) {
          console.log("Trigger checkProximity: triggering on proximity (distance =", distance, ")");
          this.triggered = true;
          await this.trigger();
        }
      } else {
        this.triggered = false;
      }
    } else if (inputType === 'multi-proximity') {
      if (distance > proximityDistance) {
        this.triggered = false;
        return;
      }
      const users = await this.plugin.user.getNearbyUsers();
      const count = users && Array.isArray(users)
        ? users.filter(u => typeof u.distance === 'number' && u.distance <= proximityDistance).length
        : 0;
      const required = parseInt(this.getField('requiredUserCount')) || 2;
      if (count >= required && !this.triggered) {
        console.log("Trigger checkProximity: triggering on multi-proximity (count =", count, ")");
        this.triggered = true;
        await this.trigger();
      } else if (count < required) {
        this.triggered = false;
      }
    }
  }

  async trigger() {
    const roleRestricted = this.getField('roleRestricted') === true ||
                           String(this.getField('roleRestricted')).toLowerCase() === "true";
    const requiredRole = this.getField('requiredRole') || "";
    const assignRole = this.getField('assignRole') || "";
    const userRoles = this.plugin.getUserRoles(this.userID);
    console.log("Trigger invoked: roleRestricted =", roleRestricted, 
                "requiredRole =", requiredRole, 
                "assignRole =", assignRole, 
                "userRoles =", userRoles);
    if (roleRestricted && requiredRole) {
      if (!this.plugin.isValidRole(requiredRole)) {
        console.log("Trigger aborted: requiredRole is not valid.");
        return;
      }
      if (userRoles.indexOf(requiredRole) === -1) {
        console.log("Trigger aborted: user does not have required role.");
        return;
      }
    }
    if (assignRole) {
      if (this.plugin.isValidRole(assignRole)) {
        if (userRoles.indexOf(assignRole) === -1) {
          this.plugin.assignUserRole(this.userID, assignRole);
          console.log("Trigger: assigned role", assignRole, "to user", this.userID);
        }
      } else {
        console.log("Trigger: assignRole", assignRole, "is not valid.");
      }
    }
    const actionID = this.getField('actionID') || '';
    const isAdmin = await this.plugin.user.isAdmin();
    console.log("Sending trigger message for actionID:", actionID);
    this.plugin.messages.send({
      action: 'trigger',
      actionID: actionID,
      instanceID: this.plugin.instanceID,
      userID: this.userID,
      objectID: this.objectID,
      isAdmin: isAdmin
    }, false);
  }

  dist(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  async getNearbyUserCount(radius) {
    const users = await this.plugin.user.getNearbyUsers();
    if (users && Array.isArray(users)) {
      return users.filter(u => typeof u.distance === 'number' && u.distance <= radius).length;
    }
    return 0;
  }

  async onMessage(msg) { }
}

/**
 * Receiver Component with Dynamic Updating
 */
class ReceiverComponent extends BaseComponent {
  async onLoad() {
    this.plugin.receiverComponents.push(this);
    this.userID = await this.plugin.user.getID();
    const props = await this.plugin.objects.get(this.objectID);
    console.log("Receiver onLoad: props =", props);
    if (props && props.currentState) {
      this.currentState = props.currentState;
    }
    if (props && typeof props.currentDirection !== 'undefined') {
      this.currentDirection = props.currentDirection;
    }
    await this.readSettings();
    // Removed forced default state for Reactive mode to keep live editor responsive.
    this.processingTransition = false;
    this.lastTriggerTime = 0;
  }

  async onSettingsUpdated() {
    console.log("Receiver onSettingsUpdated called.");
    await this.readSettings();
  }

  async readSettings() {
    const animMode = (this.getField('animationMode') || 'Reactive').trim();
    console.log("Receiver readSettings: animationMode =", animMode);
    this.disableLocalAudio = this.getField('disableLocalAudio') === true ||
                             String(this.getField('disableLocalAudio')).toLowerCase() === "true";
    if (animMode === 'Transition') {
      this.transitionMode = (this.getField('transitionMode') || 'Cycle').trim();
      console.log("Receiver readSettings: transitionMode =", this.transitionMode);
      if (this.transitionMode === 'Cycle') {
        let staticStatesStr = this.getField('staticStates');
        if (!staticStatesStr || staticStatesStr.trim().length === 0) {
          staticStatesStr = 'static01, static02, static03';
        }
        this.staticStates = staticStatesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        if (!this.currentState || !this.staticStates.includes(this.currentState)) {
          this.currentIndex = 0;
          this.currentState = this.staticStates[0];
        } else {
          this.currentIndex = this.staticStates.indexOf(this.currentState);
        }
        let forwardStr = this.getField('forwardTransitions');
        if (!forwardStr || forwardStr.trim().length === 0) {
          forwardStr = 'transition01, transition02';
        }
        this.forwardTransitions = forwardStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        let reverseStr = this.getField('reverseTransitions');
        if (!reverseStr || reverseStr.trim().length === 0) {
          reverseStr = 'return02, return01';
        }
        this.reverseTransitions = reverseStr.split(',').map(s => s.trim()).filter(s => s.length > 0).reverse();
        if (this.currentIndex >= this.staticStates.length - 1) {
          this.currentDirection = -1;
        } else if (this.currentIndex <= 0) {
          this.currentDirection = 1;
        } else if (typeof this.currentDirection === 'undefined') {
          this.currentDirection = 1;
        }
      } else {
        this.currentState = this.getField('initialState') || 'static01';
        try {
          this.mappingArray = JSON.parse(this.getField('transitionMapping') || '[]');
        } catch (e) {
          console.log("Receiver readSettings: error parsing mappingArray", e);
          this.mappingArray = [];
        }
      }
    }
  }

  onUnload() {
    const index = this.plugin.receiverComponents.indexOf(this);
    if (index > -1) {
      this.plugin.receiverComponents.splice(index, 1);
    }
    console.log("Receiver onUnload: Removed object", this.objectID);
  }

  async onClick() { }

  async onMessage(msg) {
    if (msg.action === 'trigger' && msg.actionID === this.getField('actionID')) {
      const roleRestricted = this.getField('roleRestricted') === true ||
                             String(this.getField('roleRestricted')).toLowerCase() === "true";
      const requiredRole = this.getField('requiredRole') || "";
      console.log("Receiver onMessage: roleRestricted =", roleRestricted, "requiredRole =", requiredRole);
      if (roleRestricted && requiredRole) {
        if (!this.plugin.isValidRole(requiredRole)) {
          console.log("Receiver onMessage: requiredRole is not valid.");
          return;
        }
        const userRoles = this.plugin.getUserRoles(msg.userID);
        if (userRoles.indexOf(requiredRole) === -1) {
          console.log("Receiver onMessage: user", msg.userID, "does not have required role.");
          return;
        }
      }
      this.handleTrigger();
    }
  }

  async handleTrigger() {
    const cooldown = parseFloat(this.getField('cooldown')) || 1;
    const now = Date.now();
    if (now - this.lastTriggerTime < cooldown * 1000) {
      console.log("Receiver handleTrigger: cooldown in effect.");
      return;
    }
    this.lastTriggerTime = now;
    if (this.processingTransition) {
      console.log("Receiver handleTrigger: already processing transition.");
      return;
    }
    this.processingTransition = true;
    const mode = (this.getField('animationMode') || 'Reactive').trim();
    console.log("Receiver handleTrigger: mode =", mode);
    if (mode === 'Reactive') {
      await this.handleReactive();
    } else if (mode === 'Transition') {
      const transMode = (this.getField('transitionMode') || 'Cycle').trim();
      console.log("Receiver handleTrigger: transition mode =", transMode);
      if (transMode === 'Cycle') {
        await this.handleTransitionCycle();
      } else {
        await this.handleTransitionMapping();
      }
    } else {
      this.processingTransition = false;
    }
  }

  async getAnimationDuration(animationName) {
    try {
      const animStr = await this.plugin.objects.getAnimations(this.objectID);
      const animations = JSON.parse(animStr);
      const anim = animations.find(a => a.name.toLowerCase().includes(animationName.toLowerCase()));
      if (anim && anim.duration) {
        return anim.duration * 1000;
      }
    } catch (e) {
      console.log("Error in getAnimationDuration:", e);
    }
    return 2000;
  }

  async handleReactive() {
    const reactiveAnimation = this.getField('reactiveAnimation');
    const defaultAnimation = this.getField('defaultAnimation');
    const duration = await this.getAnimationDuration(reactiveAnimation);
    console.log("Receiver handleReactive: reactiveAnimation =", reactiveAnimation, "defaultAnimation =", defaultAnimation, "duration =", duration);
    await this.plugin.objects.update(this.objectID, {
      animation: [{ name: reactiveAnimation }],
      currentState: reactiveAnimation,
      dateModified: Date.now()
    }, false);
    if (!this.disableLocalAudio) {
      this.playSound(duration);
    } else {
      this.plugin.messages.send({
        action: 'relaySound',
        sourceID: this.objectID,
        soundFile: this.getField('sound'),
        volume: parseFloat(this.getField('volume')) || 1,
        duration: duration
      }, false);
    }
    setTimeout(async () => {
      await this.plugin.objects.update(this.objectID, {
        animation: [{ name: defaultAnimation }],
        currentState: defaultAnimation,
        dateModified: Date.now()
      }, false);
      setTimeout(() => {
        this.processingTransition = false;
      }, (parseFloat(this.getField('cooldown')) || 1) * 1000);
    }, duration);
  }

  async handleTransitionCycle() {
    if (!this.staticStates || this.staticStates.length === 0) {
      let defaultStates = 'static01, static02, static03';
      this.staticStates = defaultStates.split(',').map(s => s.trim());
      this.currentIndex = 0;
      this.currentState = this.staticStates[0];
      this.currentDirection = 1;
      console.log("Receiver handleTransitionCycle: using default staticStates");
    }
    if (this.currentIndex >= this.staticStates.length - 1) {
      this.currentDirection = -1;
    } else if (this.currentIndex <= 0) {
      this.currentDirection = 1;
    }
    if (this.currentDirection === 1) {
      let nextIndex = this.currentIndex + 1;
      if (nextIndex < this.staticStates.length) {
        let transitionAnim = this.forwardTransitions[this.currentIndex] || this.forwardTransitions[0] || 'transition01';
        let duration = await this.getAnimationDuration(transitionAnim);
        await this.plugin.objects.update(this.objectID, { animation: [{ name: transitionAnim }], dateModified: Date.now() }, false);
        if (!this.disableLocalAudio) {
          this.playSound(duration);
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false);
        }
        setTimeout(() => {
          this.plugin.objects.update(this.objectID, {
            animation: [{ name: this.staticStates[nextIndex] }],
            currentState: this.staticStates[nextIndex],
            dateModified: Date.now()
          }, false);
          console.log("Receiver handleTransitionCycle: Switched to state", this.staticStates[nextIndex]);
          this.currentIndex = nextIndex;
          this.currentState = this.staticStates[this.currentIndex];
          this.plugin.objects.update(this.objectID, { currentState: this.currentState, currentDirection: this.currentDirection, dateModified: Date.now() }, false);
          this.processingTransition = false;
        }, duration);
      } else {
        this.processingTransition = false;
      }
    } else if (this.currentDirection === -1) {
      let nextIndex = this.currentIndex - 1;
      if (nextIndex >= 0) {
        let transitionAnim = this.reverseTransitions[nextIndex] || this.reverseTransitions[0] || 'return01';
        let duration = await this.getAnimationDuration(transitionAnim);
        await this.plugin.objects.update(this.objectID, { animation: [{ name: transitionAnim }], dateModified: Date.now() }, false);
        if (!this.disableLocalAudio) {
          this.playSound(duration);
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false);
        }
        setTimeout(() => {
          this.plugin.objects.update(this.objectID, {
            animation: [{ name: this.staticStates[nextIndex] }],
            currentState: this.staticStates[nextIndex],
            dateModified: Date.now()
          }, false);
          console.log("Receiver handleTransitionCycle: Switched to state", this.staticStates[nextIndex]);
          this.currentIndex = nextIndex;
          this.currentState = this.staticStates[this.currentIndex];
          this.plugin.objects.update(this.objectID, { currentState: this.currentState, currentDirection: this.currentDirection, dateModified: Date.now() }, false);
          this.processingTransition = false;
        }, duration);
      } else {
        this.processingTransition = false;
      }
    }
  }

  async handleTransitionMapping() {
    if (!this.mappingArray || this.mappingArray.length === 0) {
      this.processingTransition = false;
      return;
    }
    let duration;
    let mapping = this.mappingArray.find(m => m.from === this.currentState);
    if (mapping) {
      duration = await this.getAnimationDuration(mapping.forward);
      await this.plugin.objects.update(this.objectID, { animation: [{ name: mapping.forward }], dateModified: Date.now() }, false);
      if (mapping.soundForward && mapping.soundForward.trim().length > 0) {
        if (!this.disableLocalAudio) {
          await this.playSoundWithFile(duration, mapping.soundForward);
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: mapping.soundForward,
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false);
        }
      } else {
        if (!this.disableLocalAudio) {
          this.playSound(duration);
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false);
        }
      }
      setTimeout(() => {
        this.plugin.objects.update(this.objectID, {
          animation: [{ name: mapping.to }],
          currentState: mapping.to,
          dateModified: Date.now()
        }, false);
        console.log("Receiver handleTransitionMapping: Transitioned to", mapping.to);
        this.currentState = mapping.to;
        this.processingTransition = false;
      }, duration);
      return;
    }
    mapping = this.mappingArray.find(m => m.to === this.currentState);
    if (mapping) {
      duration = await this.getAnimationDuration(mapping.return);
      await this.plugin.objects.update(this.objectID, { animation: [{ name: mapping.return }], dateModified: Date.now() }, false);
      if (mapping.soundReturn && mapping.soundReturn.trim().length > 0) {
        if (!this.disableLocalAudio) {
          await this.playSoundWithFile(duration, mapping.soundReturn);
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: mapping.soundReturn,
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false);
        }
      } else {
        if (!this.disableLocalAudio) {
          this.playSound(duration);
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false);
        }
      }
      setTimeout(() => {
        this.plugin.objects.update(this.objectID, {
          animation: [{ name: mapping.from }],
          currentState: mapping.from,
          dateModified: Date.now()
        }, false);
        console.log("Receiver handleTransitionMapping: Reverse transitioned to", mapping.from);
        this.currentState = mapping.from;
        this.processingTransition = false;
      }, duration);
      return;
    }
    this.processingTransition = false;
  }

  async playSound(duration) {
    const soundFile = this.getField('sound');
    const volume = parseFloat(this.getField('volume')) || 1;
    if (soundFile && soundFile.trim().length > 0) {
      this.audioID = await this.plugin.audio.play(
        this.plugin.paths.absolute(soundFile),
        { volume: volume, x: this.fields.x, y: this.fields.y, height: this.fields.height }
      );
      this.plugin.messages.send({
        action: 'relaySound',
        sourceID: this.objectID,
        soundFile: soundFile,
        volume: volume,
        duration: duration
      }, false);
      setTimeout(() => {
        this.plugin.audio.stop(this.audioID);
      }, duration);
    }
  }

  async playSoundWithFile(duration, soundFile) {
    const volume = parseFloat(this.getField('volume')) || 1;
    if (soundFile && soundFile.trim().length > 0) {
      this.audioID = await this.plugin.audio.play(
        this.plugin.paths.absolute(soundFile),
        { volume: volume, x: this.fields.x, y: this.fields.y, height: this.fields.height }
      );
      setTimeout(() => {
        this.plugin.audio.stop(this.audioID);
      }, duration);
    }
  }
}

/**
 * Asset Link Secondary Audio Output Component
 */
class AssetLinkSecondaryAudioOutput extends BaseComponent {
  async onLoad() {
    this.plugin.secondaryComponents.push(this);
    this.userID = await this.plugin.user.getID();
    this.sourceID = this.getField('sourceID') || "";
  }

  async onSettingsUpdated() {
    this.sourceID = this.getField('sourceID') || "";
  }

  onUnload() {
    const index = this.plugin.secondaryComponents.indexOf(this);
    if (index > -1) {
      this.plugin.secondaryComponents.splice(index, 1);
    }
  }

  async onMessage(msg) {
    if (msg.action === 'relaySound' && msg.sourceID === this.sourceID) {
      const volume = msg.volume || 1;
      const duration = msg.duration || 2000;
      const soundFile = msg.soundFile;
      this.audioID = await this.plugin.audio.play(this.plugin.paths.absolute(soundFile), {
        volume: volume,
        x: this.fields.x,
        y: this.fields.y,
        height: this.fields.height
      });
      setTimeout(() => {
        this.plugin.audio.stop(this.audioID)
      }, duration);
    }
  }
}
