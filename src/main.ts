import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ChatWorkbenchComponent } from './app/chat-workbench.component';

bootstrapApplication(ChatWorkbenchComponent, {
  providers: [provideAnimations()]
}).catch(err => console.error(err));
