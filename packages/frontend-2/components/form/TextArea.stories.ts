import { userEvent, within } from '@storybook/testing-library'
import FormTextArea from '~~/components/form/TextArea.vue'
import { Story, Meta } from '@storybook/vue3'
import { VuePlayFunction, mergeStories } from '~~/lib/common/helpers/storybook'
import { wait } from '@speckle/shared'

export default {
  component: FormTextArea,
  parameters: {
    docs: {
      description: {
        component:
          'A textarea box, integrated with vee-validate for validation. Feed in rules through the `rules` prop.'
      }
    }
  },
  argTypes: {
    rules: {
      type: 'function'
    },
    'update:modelValue': {
      type: 'function',
      action: 'v-model'
    }
  }
} as Meta

const generateRandomName = (prefix: string) => `${prefix}-${Math.random() * 100000}`

const buildTextWriterPlayFunction =
  (text: string): VuePlayFunction =>
  async (params) => {
    const { canvasElement, viewMode } = params
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox')

    // https://github.com/storybookjs/storybook/pull/19659
    await userEvent.type(input, text, { delay: viewMode === 'story' ? 100 : 0 })

    userEvent.tab()
  }

export const Default: Story = {
  render: (args) => ({
    components: { FormTextArea },
    setup() {
      return { args }
    },
    template: `<div class="bg-foundation p-5">
    <form-text-area v-bind="args" @update:modelValue="args['update:modelValue']"/>
    </div>`
  }),
  play: buildTextWriterPlayFunction('Hello world!'),
  args: {
    modelValue: '',
    name: generateRandomName('default'),
    help: 'Some help text',
    placeholder: 'Placeholder text!',
    label: 'Textarea w/ Label:',
    showRequired: false,
    showLabel: true,
    disabled: false,
    validateOnMount: false
  },
  parameters: {
    docs: {
      source: {
        code: `<FormTextArea name="unique-id" v-model="model" :rules="(val) => val ? true : 'Value is required!'"/>`
      }
    }
  }
}

export const Required = mergeStories(Default, {
  play: async (params) => {
    const { canvasElement } = params
    await buildTextWriterPlayFunction('some text')(params)

    await wait(1000)

    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox')

    userEvent.clear(input)

    await wait(1000)

    userEvent.tab()
  },
  args: {
    name: generateRandomName('required'),
    label: 'This one is required!',
    showRequired: true,
    rules: [(val: string) => (val ? true : 'This field is required')],
    validateOnMount: true
  }
})

export const Disabled = mergeStories(Default, {
  play: buildTextWriterPlayFunction('12345'),
  args: {
    name: generateRandomName('disabled'),
    label: 'Disabled input',
    disabled: true
  }
})

export const WithClear = mergeStories(Default, {
  play: buildTextWriterPlayFunction('12345'),
  args: {
    name: generateRandomName('withclear'),
    label: 'Click on cross to clear',
    showClear: true
  }
})
