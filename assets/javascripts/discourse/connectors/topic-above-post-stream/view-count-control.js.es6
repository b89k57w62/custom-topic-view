import Component from "@glimmer/component";
import { service } from "@ember/service";
import { action } from "@ember/object";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";

export default class ViewCountControl extends Component {
  @service siteSettings;
  @service currentUser;
  @service modal;

  @tracked isEditing = false;
  @tracked editValue = "";
  @tracked isLoading = false;
  @tracked lastUpdateTime = 0;

  MIN_UPDATE_INTERVAL = 2000;
  MAX_UPDATES_PER_MINUTE = 10;
  updateTimestamps = [];

  get topic() {
    return this.args.outletArgs?.model || 
           this.args.outletArgs?.topic || 
           this.args.model || 
           this.args.topic;
  }

  get canEditViewCount() {
    if (!this.currentUser) return false;
    
    if (this.currentUser.admin) return true;
    
    if (this.siteSettings.view_count_staff_only && this.currentUser.staff) {
      return true;
    }
    
    return false;
  }

  get canUpdate() {
    const now = Date.now();
    
    if (now - this.lastUpdateTime < this.MIN_UPDATE_INTERVAL) {
      return false;
    }
    
    const oneMinuteAgo = now - 60000;
    this.updateTimestamps = this.updateTimestamps.filter(timestamp => timestamp > oneMinuteAgo);
    
    return this.updateTimestamps.length < this.MAX_UPDATES_PER_MINUTE;
  }

  recordUpdate() {
    const now = Date.now();
    this.lastUpdateTime = now;
    this.updateTimestamps.push(now);
  }

  @action
  openViewCountModal() {
    if (!this.canUpdate) {
      this.showRateLimitError();
      return;
    }
    this.showViewCountEditForm();
  }

  @action
  showViewCountEditForm() {
    this.isEditing = true;
    this.editValue = this.topic.custom_view_count || this.topic.views || 0;
  }

  @action
  async saveViewCount() {
    if (!this.canUpdate) {
      this.showRateLimitError();
      return;
    }

    if (this.isLoading) {
      return;
    }

    const customCount = parseInt(this.editValue) || 0;
    const useCustom = customCount > 0;
    
    this.isLoading = true;
    
    try {
      await this.updateViewCount(customCount, useCustom);
      this.isEditing = false;
    } catch (error) {
    } finally {
      this.isLoading = false;
    }
  }

  @action
  cancelEdit() {
    this.isEditing = false;
    this.editValue = "";
  }

  @action
  updateEditValue(event) {
    this.editValue = event.target.value;
  }

  @action
  async updateViewCount(customCount, useCustom) {
    const topic = this.topic;
    if (!topic) return;

    if (!this.canUpdate) {
      this.showRateLimitError();
      return;
    }

    this.recordUpdate();

    try {
      await ajax(`/t/${topic.id}`, {
        type: "PUT",
        data: { 
          custom_view_count: customCount,
          use_custom_view_count: useCustom
        }
      });

      topic.set("custom_view_count", customCount);
      topic.set("use_custom_view_count", useCustom);
      topic.notifyPropertyChange("custom_view_count");
      topic.notifyPropertyChange("use_custom_view_count");
      
      if (useCustom && customCount > 0) { 
        const baseViews = topic.views || 0;
        const totalViews = baseViews + customCount;
        topic.set("display_view_count", totalViews);
      } else {
        topic.set("display_view_count", topic.views);
      }
      topic.notifyPropertyChange("display_view_count");

      this.showSuccessMessage();

    } catch (error) {
      if (error.jqXHR?.status === 429) {
        this.showRateLimitError();
      } else {
        popupAjaxError(error);
      }
      throw error;
    }
  }

  showRateLimitError() {
    if (window.bootbox) {
      window.bootbox.alert(
        I18n.t('js.view_count_control.rate_limit_error', {
          defaultValue: 'You are updating too frequently. Please wait a moment before trying again.'
        })
      );
    }
  }

  showSuccessMessage() {
    if (window.Discourse?.User?.currentProp) {
      const user = window.Discourse.User.current();
      if (user) {
        user.appEvents?.trigger('popup-message', {
          message: I18n.t('js.view_count_control.success', {
            defaultValue: 'View count updated successfully'
          }),
          type: 'success'
        });
      }
    }
  }
}

class ViewCountModal extends Component {
  @service modal;
  @tracked customViewCount = "";
  @tracked useCustomViewCount = false;

  constructor() {
    super(...arguments);
    const topic = this.args.model.topic;
    this.customViewCount = topic.custom_view_count || topic.views || 0;
    this.useCustomViewCount = topic.use_custom_view_count || false;
  }

  get topic() {
    return this.args.model.topic;
  }

  @action
  updateCustomCount(event) {
    this.customViewCount = parseInt(event.target.value) || 0;
  }

  @action
  toggleUseCustom(event) {
    this.useCustomViewCount = event.target.checked;
  }

  @action
  async save() {
    const customCount = parseInt(this.customViewCount) || 0;
    
    if (customCount < 0) {
      return;
    }

    try {
      await this.args.model.onSave(customCount, this.useCustomViewCount);
      this.modal.close();
    } catch (error) {
    }
  }

  @action
  cancel() {
    this.modal.close();
  }
} 