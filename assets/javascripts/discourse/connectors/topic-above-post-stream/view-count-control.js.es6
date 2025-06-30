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

  @action
  openViewCountModal() {
    this.showViewCountEditForm();
  }

  @action
  showViewCountEditForm() {
    this.isEditing = true;
    this.editValue = this.topic.custom_view_count || this.topic.views || 0;
  }

  @action
  async saveViewCount() {
    const customCount = parseInt(this.editValue) || 0;
    const useCustom = customCount > 0;
    
    await this.updateViewCount(customCount, useCustom);
    this.isEditing = false;
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

    } catch (error) {
      popupAjaxError(error);
    }
  }
}

// Modal component for editing view count
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
      // Show error message
      return;
    }

    await this.args.model.onSave(customCount, this.useCustomViewCount);
    this.modal.close();
  }

  @action
  cancel() {
    this.modal.close();
  }
} 