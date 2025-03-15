import { BasePlugin, BaseComponent } from 'vatom-spaces-plugins'

/**
 * Asset Link Plugin
 *
 * This plugin links assets together via interactions. It registers three components:
 *
 *  • Trigger Component – activated via On-Click, Proximity, or Multi-Proximity interactions.
 *     It sends out a trigger message using a user-defined ActionID. It can also restrict
 *     activation based on roles and assign a role when triggered.
 *
 *  • Receiver Component – listens for trigger messages and then performs animations and sound.
 *     It supports both Reactive and Transition animation modes. In addition, it can restrict
 *     processing of triggers based on a required role.
 *
 *  • Asset Link Secondary Audio Output – relays sound from a specified source so that the sound is
 *     played from a secondary location.
 *
 * An admin-only Role Management panel is registered (via the Menus API) to allow the Space designer
 * to configure the available roles and clear all role assignments. User roles persist across sessions
 * until cleared by an admin.
 *
 * @license MIT
 * @author Leone Amurri
 */
export default class AssetLink extends BasePlugin {
  static get id() { return 'assetlink' }
  static get name() { return 'Asset Link' }
  static get description() { return 'Link assets together via interactive triggers, receivers, and secondary audio outputs.' }

  instanceID = Math.random().toString(36).substring(2)
  triggerComponents = []
  receiverComponents = []
  secondaryComponents = []

  // Global mapping of user roles (userID -> array of role strings)
  userRoles = {}

  // Returns the roles assigned to a given user.
  getUserRoles(userID) {
    return this.userRoles[userID] || []
  }

  // Assigns a role to a user (if not already assigned).
  assignUserRole(userID, role) {
    if (!this.userRoles[userID]) {
      this.userRoles[userID] = []
    }
    if (this.userRoles[userID].indexOf(role) === -1) {
      this.userRoles[userID].push(role)
    }
  }

  // Clears all role assignments.
  clearAllRoles() {
    this.userRoles = {}
    // Optionally persist this change if a persistent storage mechanism is available.
  }

  async onLoad() {
    // Clear previous references.
    this.triggerComponents = []
    this.receiverComponents = []
    this.secondaryComponents = []

    this.userID = await this.user.getID()

    // Register admin-only Role Management panel using the Menus API.
    if (await this.user.isAdmin()) {
      this.menus.register({
        id: 'assetlink-role-management',
        title: 'Role Management',
        section: 'admin-panel',
        panel: {
          // This panel should load an HTML file (role-management.html) that lets the admin
          // define a comma-separated list of available roles and includes a Clear All Roles button.
          iframeURL: this.paths.absolute('./role-management.html'),
          width: 400,
          height: 300,
          onClose: () => { /* Optionally update available roles from the panel */ }
        }
      })
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
        // New Role-based settings:
        { id: 'roleRestricted', name: 'Role Restricted', type: 'checkbox',
          help: 'If checked, only users with a specific role can trigger this asset.', default: false },
        { id: 'requiredRole', name: 'Required Role', type: 'select',
          help: 'Select the role required to trigger this asset. (Dropdown populated from the Role Management panel)',
          // Default values here can be an empty list; they should be updated dynamically in practice.
          values: [] },
        { id: 'assignRole', name: 'Role to Assign', type: 'select',
          help: 'Select the role to assign to a user upon trigger activation.',
          values: [] }
      ]
    })

    // Register Receiver Component.
    this.objects.registerComponent(ReceiverComponent, {
      id: 'asset-link-receiver',
      name: 'Asset Link Receiver',
      description: 'Listens for triggers and performs animations and sound. Also relays its sound via messages. ' +
                   'Can restrict processing by role.',
      settings: [
        { id: 'header-receiver', type: 'label', value: 'Receiver Settings' },
        { id: 'actionID', name: 'ActionID', type: 'input',
          help: 'Enter the ActionID this receiver should listen for. (Ensure unique IDs for independent assets)' },
        { id: 'adminOnly', name: 'Admin Only', type: 'checkbox',
          help: 'If checked, this receiver only processes triggers from admin users.', default: false },
        // New Role-based settings:
        { id: 'roleRestricted', name: 'Role Restricted', type: 'checkbox',
          help: 'If checked, only triggers from users with the required role will be processed.', default: false },
        { id: 'requiredRole', name: 'Required Role', type: 'select',
          help: 'Select the role required to interact with this receiver.',
          values: [] },
        { id: 'header-sound', type: 'label', value: 'Sound Settings' },
        { id: 'sound', name: 'Sound', type: 'string',
          help: 'Sound file URL (or path) for playback (applies to both Reactive and Transition modes).', default: '' },
        { id: 'volume', name: 'Volume', type: 'slider',
          help: 'Set the volume for audio playback (0 to 1).', default: 1, min: 0, max: 1, precision: 2 },
        { id: 'disableLocalAudio', name: 'Disable Local Audio', type: 'checkbox',
          help: 'If checked, the receiver will not play audio locally (only secondary outputs will play audio).', default: false },
        { id: 'animationMode', name: 'Animation Mode', type: 'select',
          help: 'Reactive: one-off animation; Transition: cycle or mapping transitions.',
          values: ['Reactive', 'Transition'], default: 'Reactive' },
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
    })

    // Register Secondary Audio Output Component.
    this.objects.registerComponent(AssetLinkSecondaryAudioOutput, {
      id: 'asset-link-secondary',
      name: 'Asset Link Secondary Audio Output',
      description: 'Relays sound from a specified source so that the sound is played from this asset’s location.',
      settings: [
        { id: 'sourceID', name: 'Source Object ID', type: 'input', help: 'Enter the ID of the object whose sound should be relayed.' }
      ]
    })
  }

  async onMessage(msg) {
    this.receiverComponents.forEach(comp => {
      if (comp.getField('actionID') === msg.actionID) {
        if (String(comp.getField('adminOnly')).toLowerCase() === "true" && !msg.isAdmin) return
        // In the receiver, role restrictions are checked within handleTrigger.
        comp.sendMessage({ fromUser: this.userID, action: 'trigger', actionID: msg.actionID, isAdmin: msg.isAdmin, userID: msg.userID }, true)
      }
    })
    this.secondaryComponents.forEach(comp => {
      comp.sendMessage(msg, true)
    })
  }

  // (Optionally, add methods to update the available roles from the Role Management panel.)
  updateAvailableRoles(rolesCommaSeparated) {
    this.availableRoles = rolesCommaSeparated.split(',').map(r => r.trim()).filter(r => r.length > 0)
  }
  
  // Clear all role assignments.
  clearAllRoles() {
    this.userRoles = {}
  }
}

/**
 * Trigger Component
 */
class TriggerComponent extends BaseComponent {
  async onLoad() {
    this.plugin.triggerComponents.push(this)
    this.userID = await this.plugin.user.getID()
    this.currentInputType = (this.getField('inputType') || "On-Click").trim().toLowerCase()
    if (this.currentInputType === 'proximity' || this.currentInputType === 'multi-proximity') {
      this.timer = setInterval(this.checkProximity.bind(this), 100)
    }
    this.inputTypeChecker = setInterval(() => {
      const newType = (this.getField('inputType') || "On-Click").trim().toLowerCase()
      if (newType !== this.currentInputType) {
        this.onSettingsUpdated()
      }
    }, 500)
  }

  async onSettingsUpdated() {
    const newInputType = (this.getField('inputType') || "On-Click").trim().toLowerCase()
    if (newInputType !== this.currentInputType) {
      this.currentInputType = newInputType
      this.triggered = false
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
    if (newInputType === 'proximity' || newInputType === 'multi-proximity') {
      this.timer = setInterval(this.checkProximity.bind(this), 100)
    } else {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  onUnload() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.inputTypeChecker) {
      clearInterval(this.inputTypeChecker)
      this.inputTypeChecker = null
    }
    const index = this.plugin.triggerComponents.indexOf(this)
    if (index > -1) {
      this.plugin.triggerComponents.splice(index, 1)
    }
  }

  async onClick() {
    if ((this.getField('inputType') || "On-Click").trim().toLowerCase() === 'on-click') {
      await this.trigger()
    }
  }

  async checkProximity() {
    const inputType = (this.getField('inputType') || "On-Click").trim().toLowerCase()
    const proximityDistance = parseFloat(this.getField('proximityDistance')) || 2
    const userPosition = await this.plugin.user.getPosition()
    const objPosition = { x: this.fields.x, y: this.fields.height, z: this.fields.y }
    const distance = this.dist(objPosition.x, objPosition.y, objPosition.z,
                               userPosition.x, userPosition.y, userPosition.z)
    if (inputType === 'proximity') {
      if (distance <= proximityDistance) {
        if (!this.triggered) {
          this.triggered = true
          await this.trigger()
        }
      } else {
        this.triggered = false
      }
    } else if (inputType === 'multi-proximity') {
      if (distance > proximityDistance) {
        this.triggered = false
        return
      }
      const users = await this.plugin.user.getNearbyUsers()
      const count = users && Array.isArray(users)
        ? users.filter(u => typeof u.distance === 'number' && u.distance <= proximityDistance).length
        : 0
      const required = parseInt(this.getField('requiredUserCount')) || 2
      if (count >= required && !this.triggered) {
        this.triggered = true
        await this.trigger()
      } else if (count < required) {
        this.triggered = false
      }
    }
  }

  async trigger() {
    // Role-restricted trigger settings.
    const roleRestricted = this.getField('roleRestricted') === true || String(this.getField('roleRestricted')).toLowerCase() === "true"
    const requiredRole = this.getField('requiredRole') || ""
    const assignRole = this.getField('assignRole') || ""
    const userRoles = this.plugin.getUserRoles(this.userID)
    if (roleRestricted && requiredRole && userRoles.indexOf(requiredRole) === -1) {
      // User does not have required role; do not trigger.
      return
    }
    // If a role is to be assigned and not already present, assign it.
    if (assignRole && userRoles.indexOf(assignRole) === -1) {
      this.plugin.assignUserRole(this.userID, assignRole)
    }
    const actionID = this.getField('actionID') || ''
    const isAdmin = await this.plugin.user.isAdmin()
    this.plugin.messages.send({
      action: 'trigger',
      actionID: actionID,
      instanceID: this.plugin.instanceID,
      userID: this.userID,
      objectID: this.objectID,
      isAdmin: isAdmin
    }, false)
  }

  dist(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  async getNearbyUserCount(radius) {
    const users = await this.plugin.user.getNearbyUsers()
    if (users && Array.isArray(users)) {
      return users.filter(u => typeof u.distance === 'number' && u.distance <= radius).length
    }
    return 0
  }

  async onMessage(msg) { }
}

/**
 * Receiver Component with Dynamic Updating
 */
class ReceiverComponent extends BaseComponent {
  async onLoad() {
    this.plugin.receiverComponents.push(this)
    this.userID = await this.plugin.user.getID()
    const props = await this.plugin.objects.get(this.objectID)
    if (props && props.currentState) {
      this.currentState = props.currentState
    }
    if (props && typeof props.currentDirection !== 'undefined') {
      this.currentDirection = props.currentDirection
    }
    await this.readSettings()
    this.settingsChecker = setInterval(() => { this.readSettings() }, 1000)
    this.processingTransition = false
    this.lastTriggerTime = 0
  }

  async onSettingsUpdated() {
    await this.readSettings()
  }

  async readSettings() {
    const animMode = (this.getField('animationMode') || 'Reactive').trim()
    this.disableLocalAudio = this.getField('disableLocalAudio') === true || String(this.getField('disableLocalAudio')).toLowerCase() === "true"
    if (animMode === 'Transition') {
      this.transitionMode = (this.getField('transitionMode') || 'Cycle').trim()
      if (this.transitionMode === 'Cycle') {
        let staticStatesStr = this.getField('staticStates')
        if (!staticStatesStr || staticStatesStr.trim().length === 0) {
          staticStatesStr = 'static01, static02, static03'
        }
        this.staticStates = staticStatesStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
        if (!this.currentState || !this.staticStates.includes(this.currentState)) {
          this.currentIndex = 0
          this.currentState = this.staticStates[0]
        } else {
          this.currentIndex = this.staticStates.indexOf(this.currentState)
        }
        let forwardStr = this.getField('forwardTransitions')
        if (!forwardStr || forwardStr.trim().length === 0) {
          forwardStr = 'transition01, transition02'
        }
        this.forwardTransitions = forwardStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
        let reverseStr = this.getField('reverseTransitions')
        if (!reverseStr || reverseStr.trim().length === 0) {
          reverseStr = 'return02, return01'
        }
        this.reverseTransitions = reverseStr.split(',').map(s => s.trim()).filter(s => s.length > 0).reverse()
        if (this.currentIndex >= this.staticStates.length - 1) {
          this.currentDirection = -1
        } else if (this.currentIndex <= 0) {
          this.currentDirection = 1
        } else if (typeof this.currentDirection === 'undefined') {
          this.currentDirection = 1
        }
      } else {
        this.currentState = this.getField('initialState') || 'static01'
        try {
          this.mappingArray = JSON.parse(this.getField('transitionMapping') || '[]')
        } catch (e) {
          this.mappingArray = []
        }
      }
    }
  }

  onUnload() {
    const index = this.plugin.receiverComponents.indexOf(this)
    if (index > -1) {
      this.plugin.receiverComponents.splice(index, 1)
    }
    if (this.settingsChecker) {
      clearInterval(this.settingsChecker)
      this.settingsChecker = null
    }
  }

  async onClick() { }

  async onMessage(msg) {
    if (msg.action === 'trigger' && msg.actionID === this.getField('actionID')) {
      // Role check for receiver.
      const roleRestricted = this.getField('roleRestricted') === true || String(this.getField('roleRestricted')).toLowerCase() === "true"
      const requiredRole = this.getField('requiredRole') || ""
      if (roleRestricted && requiredRole) {
        const userRoles = this.plugin.getUserRoles(msg.userID)
        if (userRoles.indexOf(requiredRole) === -1) return
      }
      this.handleTrigger()
    }
  }

  async handleTrigger() {
    const cooldown = parseFloat(this.getField('cooldown')) || 1
    const now = Date.now()
    if (now - this.lastTriggerTime < cooldown * 1000) return
    this.lastTriggerTime = now

    if (this.processingTransition) return
    this.processingTransition = true
    const mode = (this.getField('animationMode') || 'Reactive').trim()
    if (mode === 'Reactive') {
      await this.handleReactive()
    } else if (mode === 'Transition') {
      const transMode = (this.getField('transitionMode') || 'Cycle').trim()
      if (transMode === 'Cycle') {
        await this.handleTransitionCycle()
      } else {
        await this.handleTransitionMapping()
      }
    } else {
      this.processingTransition = false
    }
  }

  async getAnimationDuration(animationName) {
    try {
      const animStr = await this.plugin.objects.getAnimations(this.objectID)
      const animations = JSON.parse(animStr)
      const anim = animations.find(a => a.name.toLowerCase().includes(animationName.toLowerCase()))
      if (anim && anim.duration) {
        return anim.duration * 1000
      }
    } catch (e) { }
    return 2000
  }

  async handleReactive() {
    const reactiveAnimation = this.getField('reactiveAnimation')
    const defaultAnimation = this.getField('defaultAnimation')
    const duration = await this.getAnimationDuration(reactiveAnimation)
    await this.plugin.objects.update(this.objectID, {
      animation: [{ name: reactiveAnimation }],
      currentState: reactiveAnimation,
      dateModified: Date.now()
    }, false)
    if (!this.disableLocalAudio) {
      this.playSound(duration)
    } else {
      this.plugin.messages.send({
        action: 'relaySound',
        sourceID: this.objectID,
        soundFile: this.getField('sound'),
        volume: parseFloat(this.getField('volume')) || 1,
        duration: duration
      }, false)
    }
    setTimeout(async () => {
      await this.plugin.objects.update(this.objectID, {
        animation: [{ name: defaultAnimation }],
        currentState: defaultAnimation,
        dateModified: Date.now()
      }, false)
      setTimeout(() => {
        this.processingTransition = false
      }, (parseFloat(this.getField('cooldown')) || 1) * 1000)
    }, duration)
  }

  async handleTransitionCycle() {
    if (!this.staticStates || this.staticStates.length === 0) {
      let defaultStates = 'static01, static02, static03'
      this.staticStates = defaultStates.split(',').map(s => s.trim())
      this.currentIndex = 0
      this.currentState = this.staticStates[0]
      this.currentDirection = 1
    }
    if (this.currentIndex >= this.staticStates.length - 1) {
      this.currentDirection = -1
    } else if (this.currentIndex <= 0) {
      this.currentDirection = 1
    }
    if (this.currentDirection === 1) {
      let nextIndex = this.currentIndex + 1
      if (nextIndex < this.staticStates.length) {
        let transitionAnim = this.forwardTransitions[this.currentIndex] || this.forwardTransitions[0] || 'transition01'
        let duration = await this.getAnimationDuration(transitionAnim)
        await this.plugin.objects.update(this.objectID, { animation: [{ name: transitionAnim }], dateModified: Date.now() }, false)
        if (!this.disableLocalAudio) {
          this.playSound(duration)
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false)
        }
        setTimeout(() => {
          this.plugin.objects.update(this.objectID, {
            animation: [{ name: this.staticStates[nextIndex] }],
            currentState: this.staticStates[nextIndex],
            dateModified: Date.now()
          }, false)
          this.currentIndex = nextIndex
          this.currentState = this.staticStates[this.currentIndex]
          this.plugin.objects.update(this.objectID, { currentState: this.currentState, currentDirection: this.currentDirection, dateModified: Date.now() }, false)
          this.processingTransition = false
        }, duration)
      } else {
        this.processingTransition = false
      }
    } else if (this.currentDirection === -1) {
      let nextIndex = this.currentIndex - 1
      if (nextIndex >= 0) {
        let transitionAnim = this.reverseTransitions[nextIndex] || this.reverseTransitions[0] || 'return01'
        let duration = await this.getAnimationDuration(transitionAnim)
        await this.plugin.objects.update(this.objectID, { animation: [{ name: transitionAnim }], dateModified: Date.now() }, false)
        if (!this.disableLocalAudio) {
          this.playSound(duration)
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false)
        }
        setTimeout(() => {
          this.plugin.objects.update(this.objectID, {
            animation: [{ name: this.staticStates[nextIndex] }],
            currentState: this.staticStates[nextIndex],
            dateModified: Date.now()
          }, false)
          this.currentIndex = nextIndex
          this.currentState = this.staticStates[this.currentIndex]
          this.plugin.objects.update(this.objectID, { currentState: this.currentState, currentDirection: this.currentDirection, dateModified: Date.now() }, false)
          this.processingTransition = false
        }, duration)
      } else {
        this.processingTransition = false
      }
    }
  }

  async handleTransitionMapping() {
    if (!this.mappingArray || this.mappingArray.length === 0) {
      this.processingTransition = false
      return
    }
    let duration
    let mapping = this.mappingArray.find(m => m.from === this.currentState)
    if (mapping) {
      duration = await this.getAnimationDuration(mapping.forward)
      await this.plugin.objects.update(this.objectID, { animation: [{ name: mapping.forward }], dateModified: Date.now() }, false)
      if (mapping.soundForward && mapping.soundForward.trim().length > 0) {
        if (!this.disableLocalAudio) {
          await this.playSoundWithFile(duration, mapping.soundForward)
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: mapping.soundForward,
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false)
        }
      } else {
        if (!this.disableLocalAudio) {
          this.playSound(duration)
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false)
        }
      }
      setTimeout(() => {
        this.plugin.objects.update(this.objectID, {
          animation: [{ name: mapping.to }],
          currentState: mapping.to,
          dateModified: Date.now()
        }, false)
        this.currentState = mapping.to
        this.processingTransition = false
      }, duration)
      return
    }
    mapping = this.mappingArray.find(m => m.to === this.currentState)
    if (mapping) {
      duration = await this.getAnimationDuration(mapping.return)
      await this.plugin.objects.update(this.objectID, { animation: [{ name: mapping.return }], dateModified: Date.now() }, false)
      if (mapping.soundReturn && mapping.soundReturn.trim().length > 0) {
        if (!this.disableLocalAudio) {
          await this.playSoundWithFile(duration, mapping.soundReturn)
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: mapping.soundReturn,
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false)
        }
      } else {
        if (!this.disableLocalAudio) {
          this.playSound(duration)
        } else {
          this.plugin.messages.send({
            action: 'relaySound',
            sourceID: this.objectID,
            soundFile: this.getField('sound'),
            volume: parseFloat(this.getField('volume')) || 1,
            duration: duration
          }, false)
        }
      }
      setTimeout(() => {
        this.plugin.objects.update(this.objectID, {
          animation: [{ name: mapping.from }],
          currentState: mapping.from,
          dateModified: Date.now()
        }, false)
        this.currentState = mapping.from
        this.processingTransition = false
      }, duration)
      return
    }
    this.processingTransition = false
  }

  async playSound(duration) {
    const soundFile = this.getField('sound')
    const volume = parseFloat(this.getField('volume')) || 1
    if (soundFile && soundFile.trim().length > 0) {
      this.audioID = await this.plugin.audio.play(
        this.plugin.paths.absolute(soundFile),
        { volume: volume, x: this.fields.x, y: this.fields.y, height: this.fields.height }
      )
      this.plugin.messages.send({
        action: 'relaySound',
        sourceID: this.objectID,
        soundFile: soundFile,
        volume: volume,
        duration: duration
      }, false)
      setTimeout(() => {
        this.plugin.audio.stop(this.audioID)
      }, duration)
    }
  }

  async playSoundWithFile(duration, soundFile) {
    const volume = parseFloat(this.getField('volume')) || 1
    if (soundFile && soundFile.trim().length > 0) {
      this.audioID = await this.plugin.audio.play(
        this.plugin.paths.absolute(soundFile),
        { volume: volume, x: this.fields.x, y: this.fields.y, height: this.fields.height }
      )
      setTimeout(() => {
        this.plugin.audio.stop(this.audioID)
      }, duration)
    }
  }
}

/**
 * Asset Link Secondary Audio Output Component
 */
class AssetLinkSecondaryAudioOutput extends BaseComponent {
  async onLoad() {
    this.plugin.secondaryComponents.push(this)
    this.userID = await this.plugin.user.getID()
    this.sourceID = this.getField('sourceID') || ""
  }

  async onSettingsUpdated() {
    this.sourceID = this.getField('sourceID') || ""
  }

  onUnload() {
    const index = this.plugin.secondaryComponents.indexOf(this)
    if (index > -1) {
      this.plugin.secondaryComponents.splice(index, 1)
    }
  }

  async onMessage(msg) {
    if (msg.action === 'relaySound' && msg.sourceID === this.sourceID) {
      const volume = msg.volume || 1
      const duration = msg.duration || 2000
      const soundFile = msg.soundFile
      this.audioID = await this.plugin.audio.play(this.plugin.paths.absolute(soundFile), {
        volume: volume,
        x: this.fields.x,
        y: this.fields.y,
        height: this.fields.height
      })
      setTimeout(() => {
        this.plugin.audio.stop(this.audioID)
      }, duration)
    }
  }
}
